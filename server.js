const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Initialize Express app
const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection with enhanced options      mongodb://localhost:27017/aptitude-test
mongoose.connect("mongodb://localhost:27017/aptitude-test", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log("✅ MongoDB connected successfully"))
.catch(err => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// Models
const Topic = mongoose.model("Topic", new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }
}));

const Question = mongoose.model("Question", new mongoose.Schema({
  topic: { type: String, required: true, trim: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  answer: { type: String, required: true }
}));

const Response = mongoose.model("Response", new mongoose.Schema({
  user: { type: String, required: true },
  topic: { type: String, required: true },
  score: { type: Number, required: true },
  answers: [{
    question: { type: String, required: true },
    selected: { type: String, required: true },
    correct: { type: Boolean, required: true }
  }],
  createdAt: { type: Date, default: Date.now }
}));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date()
  });
});

// API Endpoints with improved error handling

// Get all topics
app.get("/topics", async (req, res) => {
  try {
    const topics = await Topic.find().select('name -_id');
    res.json(topics.map(t => t.name)); // Return just the names as strings
  } catch (err) {
    console.error("Error fetching topics:", err);
    res.status(500).json({ error: "Failed to fetch topics", details: err.message });
  }
});

// Get questions by topic (case-insensitive with proper error handling)
app.get("/questions/:topic", async (req, res) => {
  try {
    const topicParam = decodeURIComponent(req.params.topic).trim();
    
    // First check if topic exists
    const topicExists = await Topic.findOne({ 
      name: { $regex: new RegExp(`^${topicParam}$`, "i") }
    });
    
    if (!topicExists) {
      return res.status(404).json({ 
        error: "Topic not found",
        suggestions: await Topic.find().distinct('name')
      });
    }

    const questions = await Question.find({ 
      topic: { $regex: new RegExp(`^${topicExists.name}$`, "i") }
    }).select('-__v'); // Exclude version key

    if (!questions.length) {
      return res.status(404).json({ 
        error: "No questions found for this topic",
        topic: topicExists.name
      });
    }

    res.json(questions);
  } catch (err) {
    console.error("Error fetching questions:", err);
    res.status(500).json({ 
      error: "Failed to fetch questions",
      details: err.message 
    });
  }
});

// Submit quiz answers with improved validation
app.post("/submit", async (req, res) => {
  try {
    const { user, topic, answers } = req.body;
    
    if (!user || !topic || !answers) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const questions = await Question.find({
      topic: { $regex: new RegExp(`^${topic}$`, "i") }
    });

    if (!questions.length) {
      return res.status(404).json({ error: "No questions found for this topic" });
    }

    let score = 0;
    const responseAnswers = questions.map(q => {
      const userAnswer = answers[q._id] || '';
      
      // Find the correct option key (A, B, C, D)
      const correctOptionIndex = q.options.findIndex(opt => opt === q.answer);
      const correctOptionKey = ['A', 'B', 'C', 'D'][correctOptionIndex];
      
      // Check if the user's selected answer matches the correct option key
      const isCorrect = userAnswer === correctOptionKey;
      if (isCorrect) score++;
      
      return {
        question: q.question,
        selected: userAnswer,
        correct: isCorrect,
        correctAnswer: q.answer
      };
    });

    // Save response to database
    const response = new Response({
      user,
      topic,
      score,
      answers: responseAnswers
    });
    await response.save();

    res.json({
      score,
      total: questions.length,
      percentage: Math.round((score / questions.length) * 100),
      results: responseAnswers
    });
  } catch (err) {
    console.error("Error submitting quiz:", err);
    res.status(500).json({ 
      error: "Failed to submit quiz",
      details: err.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 CORS-enabled for: http://localhost:3000`);
});


