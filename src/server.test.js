const chai = require("chai");
const chaiHttp = require("chai-http");
const expect = chai.expect;
chai.use(chaiHttp);
const server = "http://local.nusfitness.com:5000";
const mongoose = require("mongoose");

describe("Backend Tests", () => {
  let users;

  before(() => {
    // Localhost
    mongoose.connect("mongodb://localhost:27017/nusfitness", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    });

    const db = mongoose.connection;
    users = db.collection("users");
  });

  describe("Registration/Login", () => {
    describe("POST /register", () => {
      const user = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      it("should POST a user's email and password and register the user", async () => {
        const res = await chai.request(server).post("/register").send(user);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("_id");
        expect(res.body).to.have.property("email");
        expect(res.body).to.have.property("joined");
        expect(res.body).to.have.property("salt");
        expect(res.body).to.have.property("hash");
        expect(res.body).to.have.property("__v");
        expect(res).to.have.cookie("connect.sid");
      });

      it("should not POST a user's email and passsword if they already exist", async () => {
        let res = await chai.request(server).post("/register").send(user);
        res = await chai.request(server).post("/register").send(user);
        expect(res).to.have.status(400);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("name").eql("UserExistsError");
        expect(res.body)
          .to.have.property("message")
          .eql("A user with the given username is already registered");
      });

      afterEach(async () => {
        await users.deleteOne({ email: "e0000000X@u.nus.edu" });
      });
    });

    describe("POST /login", () => {
      const existingUser = {
        email: "1@1",
        password: "1",
      };

      const nonExistingUser = {
        email: "e0000000X@u.nus.edu",
        password: "123",
      };

      const existingUserWrongPassword = {
        email: "1@1",
        password: "2",
      };

      it("should POST a user's email and password and login", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(existingUser);

        expect(res).to.have.status(200);
        expect(res).to.be.a("Object");
        expect(res.body).to.have.property("success").eql(true);
        expect(res).to.have.cookie("connect.sid");
      });

      it("should not POST a user's email and password if they do not have an account", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(nonExistingUser);

        expect(res).to.have.status(401);
      });

      it("should not POST a user's email and password if the password is wrong", async () => {
        const res = await chai
          .request(server)
          .post("/login")
          .send(existingUserWrongPassword);

        expect(res).to.have.status(401);
      });
    });
  });

  after(() => {
    mongoose.disconnect();
  });
});
