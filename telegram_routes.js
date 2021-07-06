const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const mongoose = require("mongoose");

const db = mongoose.connection;

// Add chatId to users collection
router.post("/login", (req, res) => {
  const name = req.body.name;
  const chatId = parseInt(req.body.chatId);

  // Send message to telegram bot
  fetch(`https://api.telegram.org/bot${process.env.TOKEN}/sendMessage`, {
    method: "post",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Welcome to NUSFitness ${name}! Your connection to @NUSFitness_Bot has been successful!`,
      disable_notification: false,
    }),
  }).catch((err) => res.status(400).json(err));

  // Update database with chatId
  const users = db.collection("users");
  users
    .updateOne(
      { email: req.user.email },
      {
        $set: { chatId },
      }
    )
    .catch((err) => res.status(400).json(err));

  res.status(200).json({ success: true });
});

router.post("/isLoggedIn", (req, res) => {
  const chatId = parseInt(req.body.chatId);
  const users = db.collection("users");
  users.findOne({ chatId }, (error, result) => {
    if (result) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  });
});

module.exports = router;
