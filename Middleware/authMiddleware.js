import jwt from "jsonwebtoken";

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({
            message: "Not authorized, no token"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;

        next();

    } catch (error) {
        if (

            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
            
        ) {
            return res.status(401).json({
                message: "Not authorized, invalid or expired token",
            });
        }

        console.error("Authentication error:", error);

        return res.status(500).json({
            message: "Authentication service error",
        });
    }
};

export default protect;