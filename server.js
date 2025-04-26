const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require('dotenv').config(); // <-- Important for loading .env variables

const app = express();

// Smart CORS Configuration: allow only your frontend URL
const corsOptions = {
  origin: process.env.CLIENT_URL || 'https://680cb3d6459282de046905a5--endearing-dieffenbachia-83f5c4.netlify.app/', // Allow localhost during local development, frontend during production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
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

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date()
  });
});

// Get all topics
app.get("/topics", async (req, res) => {
  try {
    const topics = await Topic.find().select('name -_id');
    res.json(topics.map(t => t.name));
  } catch (err) {
    console.error("Error fetching topics:", err);
    res.status(500).json({ error: "Failed to fetch topics", details: err.message });
  }
});

// Get questions by topic
app.get("/questions/:topic", async (req, res) => {
  try {
    const topicParam = decodeURIComponent(req.params.topic).trim();
    
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
    }).select('-__v');

    if (!questions.length) {
      return res.status(404).json({ 
        error: "No questions found for this topic",
        topic: topicExists.name
      });
    }

    res.json(questions);
  } catch (err) {
    console.error("Error fetching questions:", err);
    res.status(500).json({ error: "Failed to fetch questions", details: err.message });
  }
});

// Submit quiz answers
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
      const correctOptionIndex = q.options.findIndex(opt => opt === q.answer);
      const correctOptionKey = ['A', 'B', 'C', 'D'][correctOptionIndex];
      const isCorrect = userAnswer === correctOptionKey;
      if (isCorrect) score++;
      
      return {
        question: q.question,
        selected: userAnswer,
        correct: isCorrect
      };
    });

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
    res.status(500).json({ error: "Failed to submit quiz", details: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
