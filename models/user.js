const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');

const SessionSchema = new Schema({
    refreshToken: {
        type: String,
        default: ""
    }
})

const UserSchema = new Schema({
    joined: {
        type: Date,
        default: () => Date.now()
    },
    refreshToken: {
        type: [SessionSchema]
    }
})

// Remove refreshToken from response
UserSchema.set("toJSON", {
    transform: function (doc, ret, options) {
        delete ret.refreshToken
        return ret
    },
})

UserSchema.plugin(passportLocalMongoose, { usernameField: 'email' });

module.exports = mongoose.model('User', UserSchema);