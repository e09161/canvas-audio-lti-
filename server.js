const express = require('express');
const session = require('express-session');
const Provider = require('ims-lti').Provider;
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const helmet = require('helmet');
const compression = require('compression');
const AWS = require('aws-sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(compression());

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Database setup - use persistent storage in production
const dbPath = process.env.NODE_ENV === 'production' ? '/home/bitnami/app-data/submissions.db' : ':memory:';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    course_id TEXT,
    assignment_id TEXT,
    audio_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    duration INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Configure storage based on environment
let storage;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  // Use AWS S3 for production
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  
  storage = multer.memoryStorage();
} else {
  // Use local storage for development
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = 'uploads';
      require('fs').mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}.webm`;
      cb(null, uniqueName);
    }
  });
}

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.send('Canvas Audio LTI Tool is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/launch', (req, res) => {
  const provider = new Provider(
    req.body.oauth_consumer_key,
    process.env.LTI_SECRET,
    req.body
  );

  provider.valid_request(req, (err, isValid) => {
    if (err || !isValid) {
      console.error('LTI authentication failed:', err);
      return res.status(401).send('LTI authentication failed');
    }

    // Store LTI session data
    req.session.lti = {
      userId: req.body.user_id,
      courseId: req.body.context_id,
      assignmentId: req.body.custom_canvas_assignment_id,
      roles: req.body.roles,
      lisResultSourcedid: req.body.lis_result_sourcedid,
      lisOutcomeServiceUrl: req.body.lis_outcome_service_url,
      consumerKey: req.body.oauth_consumer_key
    };

    console.log(`LTI launch - User: ${req.body.user_id}, Course: ${req.body.context_id}`);
    res.sendFile(path.join(__dirname, 'public', 'recorder.html'));
  });
});

app.post('/upload-audio', upload.single('audio'), async (req, res) => {
  if (!req.session.lti) {
    return res.status(401).json({ error: 'Session expired. Please relaunch from Canvas.' });
  }

  try {
    const submissionId = uuidv4();
    let audioUrl;
    let fileName;

    if (req.file.buffer && process.env.AWS_ACCESS_KEY_ID) {
      // Upload to S3
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });

      fileName = `audio-${submissionId}.webm`;
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `submissions/${fileName}`,
        Body: req.file.buffer,
        ContentType: 'audio/webm',
        ACL: 'public-read'
      };

      const result = await s3.upload(params).promise();
      audioUrl = result.Location;
    } else {
      // Local file storage
      audioUrl = `/uploads/${req.file.filename}`;
      fileName = req.file.filename;
    }

    const { userId, courseId, assignmentId } = req.session.lti;

    // Store submission in database
    db.run(
      `INSERT INTO submissions (id, user_id, course_id, assignment_id, audio_url, file_name, file_size) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [submissionId, userId, courseId, assignmentId, audioUrl, fileName, req.file.size],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to save submission' });
        }

        // Send grade back to Canvas if available
        if (req.session.lti.lisOutcomeServiceUrl) {
          sendGradeToCanvas(req.session.lti, 1.0);
        }

        res.json({ 
          success: true, 
          submissionId: submissionId,
          audioUrl: audioUrl,
          message: 'Recording submitted successfully!'
        });
      }
    );
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Serve uploaded files (for local storage)
app.use('/uploads', express.static('uploads'));

// Get submission endpoint
app.get('/submission/:submissionId', (req, res) => {
  if (!req.session.lti) {
    return res.status(401).json({ error: 'Session expired' });
  }

  db.get(
    `SELECT * FROM submissions WHERE id = ? AND user_id = ?`,
    [req.params.submissionId, req.session.lti.userId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      res.json(row);
    }
  );
});

// List user's submissions
app.get('/submissions', (req, res) => {
  if (!req.session.lti) {
    return res.status(401).json({ error: 'Session expired' });
  }

  db.all(
    `SELECT id, file_name, file_size, created_at FROM submissions 
     WHERE user_id = ? AND course_id = ? AND assignment_id = ? 
     ORDER BY created_at DESC`,
    [req.session.lti.userId, req.session.lti.courseId, req.session.lti.assignmentId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

function sendGradeToCanvas(ltiData, grade) {
  try {
    const provider = new Provider(ltiData.consumerKey, process.env.LTI_SECRET);
    
    provider.outcome_service.send_replace_result(
      grade,
      (err, result) => {
        if (err) {
          console.error('Error sending grade to Canvas:', err);
        } else {
          console.log('Grade sent successfully to Canvas');
        }
      }
    );
  } catch (error) {
    console.error('Error in sendGradeToCanvas:', error);
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Application error:', error);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`Canvas Audio LTI Tool running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
