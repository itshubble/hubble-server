const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const joi = require("joi");
const User = require("../model/user");
const httpStatus = require("../util/httpStatus");
const configuration = require("../../configuration");

const JWT_LIFE_TIME = "7d";
const SALT_ROUNDS = 10;

const credentialsSchema = joi.object({
    userName: joi.string().alphanum().min(3).max(30).required(),
    password: joi.string().min(8).max(128).required(),
});

function attachRoutes(router) {
    router.use((error, request, response, next) => {
        if (error.name === "UnauthorizedError") {
            response.status(httpStatus.UNAUTHORIZED).json({
                message: "Unauthorized access",
            });
        } else {
            next(error);
        }
    });
    function createAccessToken(identifier) {
        return jwt.sign({ identifier }, configuration.secret, {
            issuer: configuration.issuer,
            audience: configuration.audience,
            expiresIn: JWT_LIFE_TIME,
            algorithm: "HS256",
        });
    }

    router.post("/sessions", async (request, response) => {
        const parameters = {
            userName: request.body.identifier,
            password: request.body.password,
        };

        const { error, value } = credentialsSchema.validate(parameters);

        if (error) {
            return response.status(httpStatus.BAD_REQUEST).json({
                message: "The specified user name or password is invalid.",
            });
        }

        const user = await User.findOne({ userName: value.userName }).exec();

        if (!user) {
            return response.status(httpStatus.BAD_REQUEST).json({
                message: "The specified user name or password is invalid.",
            });
        }

        bcrypt.compare(value.password, user.password, (error, result) => {
            if (!result) {
                return response.status(httpStatus.BAD_REQUEST).json({
                    message: "The specified user name or password is invalid.",
                });
            }

            const identifier = user._id.toString();
            response.status(httpStatus.CREATED).send({
                accessToken: createAccessToken(identifier),
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                userName: user.userName,
                emailAddress: user.emailAddress,
            });
        });
    });

    const postUsersSchema = joi.object({
        userName: joi
            .string()
            .trim()
            .alphanum()
            .lowercase()
            .min(3)
            .max(30)
            .required(),
        firstName: joi.string().trim().required(),
        lastName: joi.string().trim().required(),
        emailAddress: joi.string().email().required(),
        password: joi.string().min(8).max(128).required(),
    });

    router.post("/users", (request, response) => {
        const parameters = {
            userName: request.body.userName,
            firstName: request.body.firstName,
            lastName: request.body.lastName,
            emailAddress: request.body.emailAddress,
            password: request.body.password,
        };
        const { error, value } = postUsersSchema.validate(parameters);

        if (error) {
            throw error;
        }

        User.findOne({ userName: value.userName }).exec((error, user) => {
            if (error) {
                throw error;
            }

            if (user) {
                response.status(httpStatus.BAD_REQUEST).json({
                    message:
                        "A user with the specified user name already exists.",
                });
            } else {
                bcrypt.hash(
                    value.password,
                    SALT_ROUNDS,
                    (error, hashedPassword) => {
                        value.password = hashedPassword;
                        value.role = "REGULAR_USER";
                        const newUser = new User(value);
                        newUser.save((error) => {
                            if (error) {
                                throw error;
                            }

                            const identifier = newUser._id.toString();
                            response.status(httpStatus.CREATED).json({
                                accessToken: createAccessToken(identifier),
                            });
                        });
                    }
                );
            }
        });
    });
}

module.exports = {
    attachRoutes,
};
