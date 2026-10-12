import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },

    password: {
        type: String,
        required: true,
        minlength: 6,
    },

    role: {
        type: String,
        enum: ["renter", "owner", "admin"],
        default: "renter",
    },

     resetPasswordToken: {
        type: String,
        select: false,
    },

    resetPasswordExpires: {
        type: Date,
        select: false,
    },
},
{
    timestamps: true,
});

const User = mongoose.model("user", userSchema);

export default User;