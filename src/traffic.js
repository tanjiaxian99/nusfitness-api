const fetch = require("node-fetch");
const HTMLParser = require("node-html-parser");

// Request for pool/gym traffic
const requestTraffic = async () => {
  try {
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_public_web/public/index.php/facilities/capacity",
      {
        method: "get",
      }
    );
    root = HTMLParser.parse(await res.text());

    const poolTraffic = root
      .querySelectorAll(".swimbox > b")
      .map((e) => parseInt(e.textContent.split("/")[0]));

    const gymTraffic = root
      .querySelectorAll(".gymbox > b")
      .map((e) => parseInt(e.textContent.split("/")[0]));
    gymTraffic.push(0); // For now-defunct Wellness Outreach Gym

    return poolTraffic.concat(gymTraffic);
  } catch (err) {
    console.log(err);
  }
};

module.exports = requestTraffic;
