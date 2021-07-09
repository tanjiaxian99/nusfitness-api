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
      text: `Welcome to NUSFitness ${name}! Your connection to @NUSFitness_Bot has been successful! Press /start to begin!`,
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

router.post("/updateMenus", async (req, res) => {
  const chatId = parseInt(req.body.chatId);
  const currentMenu = req.body.currentMenu;
  const sessions = db.collection("telegram-sessions");

  let user = await sessions.findOne({ chatId });
  if (!user) {
    // Create new session if the user doesn't exists
    const res = await sessions.insertOne({ chatId });
    user = res.ops[0];
  }

  let menus = user.menus;
  if (!menus || currentMenu === "Start") {
    menus = [currentMenu];
  } else if (menus.includes(currentMenu)) {
    if (menus[menus.length - 1] === currentMenu) {
      // Refreshed menu
      res.status(200).json({ success: true });
      return;
    } else {
      const index = menus.findIndex((e) => e === currentMenu);
      menus = menus.slice(0, index + 1);
    }
  } else {
    menus.push(currentMenu);
  }

  try {
    await sessions.updateOne(
      { chatId },
      {
        $set: { menus },
      },
      { upsert: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(400).json(err);
  }
});

router.post("/getPreviousMenu", async (req, res) => {
  const chatId = parseInt(req.body.chatId);
  const skips = req.body.skips; // number of menu elements to skip
  const sessions = db.collection("telegram-sessions");
  const user = await sessions.findOne({ chatId });

  if (!user) {
    res.status(400).json({ previousMenu: null });
  } else if (user.menus.length < 2) {
    res.status(400).json({ previousMenu: null });
  } else {
    res.status(200).json({
      previousMenu: user.menus[user.menus.length - skips - 1],
    });
  }
});

module.exports = router;
