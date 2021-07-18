const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const mongoose = require("mongoose");
const requestTraffic = require("./traffic");

const db = mongoose.connection;

/**
 * @api {post} /login Add Users ChatId
 * @apiName PostLogin
 * @apiGroup Telegram
 *
 * @apiParam {String} name Users Telegram name
 * @apiParam {Number} chatId Users unique Telegram ChatId
 *
 * @apiSuccess {Object} success Success status of logging in
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError UnableToFetch Error raised by Fetch
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     TypeError: Failed to fetch
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
router.post("/login", async (req, res) => {
  const name = req.body.name;
  const chatId = parseInt(req.body.chatId);

  // Send message to telegram bot
  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.TOKEN}/sendMessage`,
      {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Welcome to NUSFitness ${name}! Your connection to @NUSFitness_Bot has been successful! Press /start to begin!`,
          disable_notification: false,
        }),
      }
    );

    // Update database with chatId
    const users = db.collection("users");
    await users.updateOne(
      { email: req.user.email },
      {
        $set: { chatId },
      }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /isLoggedIn Users Telegram logged in status
 * @apiName PostIsLoggedIn
 * @apiGroup Telegram
 *
 * @apiParam {Number} chatId Users unique Telegram ChatId
 *
 * @apiSuccess {Object} success Users logged in status
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError UserNotFound User with the given chatID is not found
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "success": false,
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
router.post("/isLoggedIn", async (req, res) => {
  try {
    const chatId = parseInt(req.body.chatId);
    const users = db.collection("users");
    const result = await users.findOne({ chatId });
    if (result) {
      res.status(200).json({ success: true });
    } else {
      console.log(`User with chatId ${chatId} is not found.`);
      res.status(400).json({ success: false });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /updateMenus Update Users visited menus
 * @apiName PostUpdateMenus
 * @apiGroup Telegram
 *
 * @apiParam {Number} chatId Users unique Telegram ChatId
 * @apiParam {String} currentMenu Users current selected menu
 *
 * @apiSuccess {Object} success Success status updating users visited menus
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "success": true
 *     }
 *
 * @apiError MongoError Error raised by MongoDB
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "name": "MongoError",
 *       "err": "E11000 duplicate key error index: test.test.$country_1  dup key: { : \"XYZ\" }",
 *       "code": 11000,
 *       "n": 0,
 *       "connectionId":10706,
 *       "ok":1
 *     }
 */
router.post("/updateMenus", async (req, res) => {
  try {
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

    await sessions.updateOne(
      { chatId },
      {
        $set: { menus },
      },
      { upsert: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(400).json(err);
  }
});

/**
 * @api {post} /getPreviousMenu Get users previous menu
 * @apiName PostGetPreviousMenu
 * @apiGroup Telegram
 *
 * @apiParam {Number} chatId Users unique Telegram ChatId
 * @apiParam {Number} skips Number of menus to traverse back to
 *
 * @apiSuccess {Object} previousMenu Previous menu that the user visited
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     {
 *       "previousMenu": "MakeAndCancel"
 *     }
 *
 * @apiError UserNotFound The user of the given chatId cannot be found
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "previousMenu": null
 *     }
 *
 * @apiError ArrayOutOfBounds Number of skips exceeds the length of the menu array
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "previousMenu": null
 *     }
 *
 */
router.post("/getPreviousMenu", async (req, res) => {
  try {
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
  } catch (err) {
    console.log(err);
    res.status(400).json({ previousMenu: null });
  }
});

/**
 * @api {get} /currentTraffic Get current traffic
 * @apiName GetCurrentTraffic
 * @apiGroup Telegram
 *
 * @apiSuccess {Number[]} traffic Traffic of all facilities at the time of request
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 Ok
 *     [33, 2, 6, 7, 36, 11]
 *
 * @apiError TrafficNotFound The current traffic cannot be retrieved
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 */
router.get("/currentTraffic", async (req, res) => {
  try {
    const traffic = await requestTraffic();
    if (traffic) {
      res.status(200).send(traffic);
    } else {
      res.status(400);
    }
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

module.exports = router;
