const fetch = require("node-fetch");
const HTMLParser = require("node-html-parser");

// Request for pool/gym traffic
const requestTraffic = async () => {
  try {
    // Retrieve nuspw cookie
    let res = await fetch(
      "https://reboks.nus.edu.sg/nus_public_web/public/auth",
      {
        method: "get",
      }
    );
    const nuspwCookie = res.headers.get("set-cookie");

    // Retrieve SAMLRequest URL
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
      {
        method: "get",
        referrer:
          "https://reboks.nus.edu.sg/nus_public_web/public/auth?redirect=%2Fnus_public_web%2Fpublic%2Fprofile%2Fbuypass%2Fgym",
        credentials: "include",
      }
    );
    const SAMLrequest = res.url;

    // Send login data and retrieve MSISLoopDetectionCookie
    res = await fetch(SAMLrequest, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        UserName: process.env.NUSNETID,
        Password: process.env.PASSWORD,
        AuthMethod: "FormsAuthentication",
      }),
      credentials: "include",
      redirect: "manual",
    });
    const MSISLoopDetectionCookie = res.headers.get("set-cookie");

    // Retrieve SAMLResponse
    res = await fetch(SAMLrequest, {
      method: "get",
      headers: {
        cookie: MSISLoopDetectionCookie,
      },
      credentials: "include",
    });
    let root = HTMLParser.parse(await res.text());
    const SAMLResponse =
      root.querySelector("input[type=hidden]").attributes.value;

    // Send SAMLResponse and retrieve SimpleSAML and SimpleSAMLAuthToken cookies
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_saml_provider/public/saml/module.php/saml/sp/saml2-acs.php/reboks",
      {
        method: "post",
        body: new URLSearchParams({
          SAMLResponse: SAMLResponse,
          RelayState:
            "http://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
        }),
        redirect: "manual",
      }
    );
    let SimpleSAMLCookies = res.headers.get("set-cookie");
    const SimpleSAML = SimpleSAMLCookies.match(/SimpleSAML=\S+;/);
    const SimpleSAMLAuthToken = SimpleSAMLCookies.match(
      /SimpleSAMLAuthToken=\S+;/
    );
    SimpleSAMLCookies = SimpleSAML + " " + SimpleSAMLAuthToken;

    // Retrieve token
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_saml_provider/public/index.php/adfs/auth",
      {
        method: "get",
        headers: {
          cookie: SimpleSAMLCookies,
        },
        credentials: "include",
      }
    );
    root = HTMLParser.parse(await res.text());
    const token = root.querySelector("input[type=hidden]").attributes.value;

    // Send token
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_public_web/public/auth/redirectAdfs",
      {
        method: "post",
        headers: {
          cookie: SimpleSAMLCookies + " " + nuspwCookie,
        },
        body: new URLSearchParams({
          token,
        }),
        credentials: "include",
        redirect: "manual",
      }
    );

    // Retrieve pool traffic
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_public_web/public/profile/buypass",
      {
        method: "get",
        headers: {
          cookie: SimpleSAMLCookies + " " + nuspwCookie,
        },
        credentials: "include",
      }
    );
    root = HTMLParser.parse(await res.text());
    const poolTraffic = root
      .querySelectorAll(".swimbox > b")
      .map((e) => parseInt(e.textContent));

    // Retrieve gym traffic
    res = await fetch(
      "https://reboks.nus.edu.sg/nus_public_web/public/profile/buypass/gym",
      {
        method: "get",
        headers: {
          cookie: SimpleSAMLCookies + " " + nuspwCookie,
        },
        credentials: "include",
      }
    );
    root = HTMLParser.parse(await res.text());
    const gymTraffic = root
      .querySelectorAll(".gymbox > b")
      .map((e) => parseInt(e.textContent));

    // Combine traffic
    const combinedTraffic = poolTraffic.concat(gymTraffic);
    return combinedTraffic;
  } catch (err) {
    console.log(err);
  }
};

module.exports = requestTraffic;
