
import User from "../Models/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";


import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
});

const registerUser = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            role = "renter"
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        // Only renters and equipment owners can register publicly.
        if (!["renter", "owner"].includes(role)) {
            return res.status(400).json({
                message: "Role must be renter or owner"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(400).json({
                message: "User with this email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email:  normalizedEmail,
            password: hashedPassword,
            role
        });

        await user.save();

        return res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            message: "Server error during registration"
        });
    }
};


const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({

            email: normalizedEmail,
            
        });
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Server error during login"
        });
    }
};


const updateUserRole = async (req, res) => {
    try {
        const { userId, role } = req.body;

        if (!userId || !role) {
            return res.status(400).json({
                message: "User ID and role are required"
            });
        }

        if (!["renter", "owner", "admin"].includes(role)) {
            return res.status(400).json({
                message: "Invalid role"
            });
        }

        if (userId === req.user.id) {
             return res.status(400).json({
                message: "You cannot change your own role",
            });
}

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        user.role = role;

        await user.save();

        return res.status(200).json({
            message: "User role updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Update user role error:", error);

        return res.status(500).json({
            message: "Server error while updating user role"
        });
    }
};


const createFirstAdmin = async (req, res) => {
    try {
        const existingAdmin = await User.findOne({
            role: "admin"
        });

        if (existingAdmin) {
            return res.status(400).json({
                message: "An admin already exists"
            });
        }

        const { name, email, password, setupKey } = req.body;
        if (
            !process.env.ADMIN_SETUP_KEY ||
            setupKey !== process.env.ADMIN_SETUP_KEY
        ) {
            return res.status(403).json({
                message: "Admin setup is not authorized",
            });
        }

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = new User({
            name,
            email,
            password: hashedPassword,
            role: "admin"
        });

        await admin.save();

        return res.status(201).json({
            message: "First admin created successfully",
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {
        console.error("Create first admin error:", error);

        return res.status(500).json({
            message: "Server error while creating first admin"
        });
    }
};


const forgotPassword = async (req, res) => {

    console.log("Forgot password route reached")

    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail,
        }).select("+resetPasswordToken +resetPasswordExpires");

        // Use the same response whether the email exists or not.
        const genericMessage =
            "If an account with that email exists, a reset link will be sent.";

        if (!user) {
            return res.status(200).json({
                message: genericMessage,
            });
        }

        // Generate a secure random token.
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Store only the hash of the token in the database.
        const hashedToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(
            Date.now() + 15 * 60 * 1000
        );

        await user.save();

        const resetUrl =
            `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: user.email,
                subject: "RentIt Password Reset",
                text: `You requested a password reset for your RentIt account.

                Open this link to reset your password:
                ${resetUrl}

                This link expires in 15 minutes. If you did not request this, ignore this email.`,
            });

        } catch (emailError) {
            // Remove the token if sending the email fails.
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            throw emailError;
        }

        return res.status(200).json({
            message: genericMessage,
        });
    } catch (error) {
        console.error("Forgot password error:", error);

        return res.status(500).json({
            message: "Unable to process password reset request",
        });
    }
};


const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

          if (
          typeof token !== "string" || typeof password !== "string" || !token || !password
          ){

            return res.status(400).json({
                message: "Reset token and new password are required",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long",
            });
        }

        // Hash the token so it matches the hash stored in MongoDB.
        const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Find a matching, unexpired reset token.
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() },
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res.status(400).json({
                message: "Reset link is invalid or has expired",
            });
        }

        // Hash the new password before saving it.
        user.password = await bcrypt.hash(password, 10);

        // Make the reset link single-use.
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        return res.status(200).json({
            message: "Password reset successful. You can now log in.",
        });
    } catch (error) {
        console.error("Reset password error:", error);

        return res.status(500).json({
            message: "Unable to reset password",
        });
    }
};



export {
    registerUser,
    loginUser,
    updateUserRole,
    createFirstAdmin,
    forgotPassword,
    resetPassword,
};
