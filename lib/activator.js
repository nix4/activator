/*jslint node:true, nomen:true */
/*global escape */

// with defaults
var async = require('async'), crypto = require('crypto'), smtp = require('./mailer'), _ = require('lodash'), mailer,
    sha1 = function (msg) {
        return crypto.createHash('sha1').update(msg).digest('hex');
    },
    DEFAULTS = {
        model: {find: function(user,cb){cb("uninitialized");}, save: function(id,data,cb){cb("uninitialized");}},
        url: "smtp://localhost:465/activator.net/"+escape("help@activator.net"),
        templates: __dirname+'/templates',
        resetExpire: 60,
        proto: "https://",
        emailProperty: "email",
        idProperty: null,
        codeLength: 20
    },
    model = DEFAULTS.model,
    url,
    templates,
    emailProperty,
    idProperty,
    resetExpire, proto,
    codeLength,
    _getActivationCodeModel = function(code, byId) {
        return function (cb) {
            if (model.activationCodeModel) {
                if(byId === true){
                    model.activationCodeModel.findById(code, function (err, actCode) {
                        if (err || !actCode) {
                            cb(new Error("Error. Password reset code specified is invalid."))
                        } else {
                            cb(null, actCode);
                        }
                    });
                }else {
                    model.activationCodeModel.findByCode(code, function (err, actCode) {
                        if (err || !actCode) {
                            cb(new Error("Error. Password reset code specified is invalid."))
                        } else {
                            cb(null, actCode);
                        }
                    });
                }

            } else {
                cb(new Error("activationCodeModel not specified"));
            }
        }
    },
    _getUser4ActivationCodeModel = function(){
        return function (activationCode, cb) {
            if (!activationCode) {
                cb(new Error("Error. Password reset code specified is invalid."));
            } else if (activationCode.expired || activationCode.expires <= Date.now() ){
                //Check if code has not expired
                cb(new Error("Password reset code is expired"));
            }else {
                //get the user for this code
                model.find(activationCode.user, function(err, user){
                    cb(err, user, activationCode);
                });
            }
        }
    },
    _finalizeActivationResponse = function(done) {
        return function (err, userModel, activationCodeModel) {
            var code = 400;
            if (err) {
                if (err === 404) {
                    code = 404;
                } else if (err === "uninitialized") {
                    code = 500;
                }
                done(code, err);
            } else {
                done(200, userModel, activationCodeModel);
            }
        }
    },
    createActivate = function (req,done) {
        // add the activation code, just a randomization of this very moment, plus the email, hashed together
        var email, id = (req.activator?req.activator.id:null) || (req.user?req.user.id:null), code;
        if (!id) {
            done(500,"User account not initialized");
        } else {
            async.waterfall([
                function(cb) {
                    model.find(id,function(err, data){
                        if(err){
                            cb(err);
                        }else{
                            cb(null, data);
                        }

                    });
                },
                function(res,cb){
                    if (!res) {
                        cb(404);
                    } else {
                        email = res[emailProperty];
                        code = sha1(email + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0,8);
                        model.save(id,{activation_code:code},cb);
                    }
                },
                function(res,cb) {
                    console.log("Result after save");
                    req.user = res;
                    if (!cb && typeof(res) === "function") {
                        cb = res;
                    }
                    mailer("activate","en_US",{code:code, email:email, id:id, request:req}, email, cb);
                }
            ],function (err, res) {
                var code = 400;
                if (err) {
                    if (err === 404) {
                        code = 404;
                    } else if (err === "uninitialized") {
                        code = 500;
                    }
                    console.log("An error occured while trying to send the mail");
                    console.log(err);
                    done(code,err);
                } else {
                    done(201,req.user);
                }
            });
        }
    },
    createActivationByCode = function (req,done) {
        // add the activation code, just a randomization of this very moment, plus the email, hashed together
        var email, id = (req.activator?req.activator.id:null) || (req.user?req.user.id:null), code;
        if (!id) {
            done(500,"User account not initialized");
        } else {
            async.waterfall([
                function(cb) {
                    model.find(id, function(err, data){
                        if(err){
                            console.log("Error on finding user..");console.log(err);
                            cb(err);
                        }else{
                            console.log("No error finding user with id=" + id);console.log(data);
                            cb(null, data);
                        }
                    });
                },
                function(res, cb){
                    if (!res) {
                        cb(404);
                    } else {
                        email = res[emailProperty];
                        code = sha1(email + id + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0, codeLength);
                        model.activationCodeModel.save({code:code, user: id, type:'account'}, function(err, newActivationCode){
                            if(!err)
                                cb(null, res);
                            else
                                cb(err);
                        });
                    }
                },
                function(res, cb) {
                    req.user = res;
                    if (!cb && typeof(res) === "function") {
                        cb = res;
                    }
                    mailer("activate", "en_US", {code:code, email:email, id:id, request:req}, email, cb);
                }
            ],function (err, res) {
                var code = 400;
                if (err) {
                    if (err === 404) {
                        code = 404;
                    } else if (err === "uninitialized") {
                        code = 500;
                    }
                    console.log("An error occured while trying to send the mail");
                    console.log(err);
                    done(code,err);
                } else {
                    done(201,req.user);
                }
            });
        }
    },
    completeActivationByCode = function (req,done) {
        var code = req.param("code");
        if(!code){
            done(401,"Activation code not provided.");
        }
        async.waterfall([
            function (cb) {
                if(model.activationCodeModel){
                    //Start by finding the record for the given activation code
                    model.activationCodeModel.findByCode(code, cb)
                }else{
                    cb(new Error("activationCodeModel not specified"));
                }
            },
            function (activationCode,cb) {
                if (!activationCode) {
                    cb(404);
                } else if (activationCode.expired || activationCode.expires <= Date.now() ){
                    //Check if code has not expired
                    cb("Expired Code");
                } else {
                    //get the user for this code
                    model.find(activationCode.user, function(err, user){
                        cb(err, user, activationCode);
                    });
                }
            },
            function(user, activationCode, cb){
                if(user){
                    req.user = user;
                    //Activate user by updating details
                    model.save(user._id, {active: true}, function(err, updatedUser){
                        //mark the code as expired
                        model.activationCodeModel.setExpired(activationCode._id, function(err, expiredCode){
                            cb(err, updatedUser);
                        });
                    });
                }else{
                    cb("User for specified activation code not found");
                }
            }
        ],function (err, res) {
            var code = 400;
            if (err) {
                if (err === 404) {
                    code = 404;
                } else if (err === "uninitialized") {
                    code = 500;
                }
                done(code,err);
            } else {
                done(200, res);
            }
        });
    },
    activatePasswordReset = function (req,done) {
        var code = req.param("code");
        if(!code || code === ""){
            done(401,"Error. Password reset code must be provided.");
            return;
        }
        async.waterfall([
            _getActivationCodeModel(code),
            _getUser4ActivationCodeModel()
        ],_finalizeActivationResponse(done));
    },

    completeActivate = function (req,done) {
        var code = req.param("code"), id = req.param("user");

        async.waterfall([
            function (cb) {model.find(id,cb);},
            function (res,cb) {
                if (!res) {
                    cb(404);
                } else if (res.activation_code !== code){
                    cb("invalidcode");
                } else {
                    req.user = res;
                    model.save(idProperty?res[idProperty]:id,{activation_code:"X", active: true},cb);
                }
            }
        ],function (err, res) {
            console.log("Activated user");
            console.log(res);
            var code = 400;
            if (err) {
                if (err === 404) {
                    code = 404;
                } else if (err === "uninitialized") {
                    code = 500;
                }
                done(code,err);
            } else {
                done(200, res);
            }
        });
    },
    createPasswordReset = function (req,done) {
        var reset_code, reset_time, email, id;
        /*
         * process:
         * 1) get the user by email
         * 2) create a random reset code
         * 3) save it
         * 4) send an email
         */
        async.waterfall([
            function (cb) {model.findByEmail(req.body[emailProperty], cb);},
            function (res,cb) {
                if (!res || res.length < 1) {
                    cb(404);
                } else {
                    email = res[emailProperty];
                    id = res.id;
                    reset_time = new Date().getTime() + resetExpire*60*1000;
//                    reset_code = sha1(email + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0,8);
                    reset_code = sha1(email + id + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0, codeLength);
                    // we just need the first 8 chars, any random code is fine
                    // expires in 60 minutes
                    // save the update
                    model.activationCodeModel.save({code:reset_code, user: id, type: 'password'}, function(err, newActivationCode){
                        if(!err)
                            cb(null, res);
                        else
                            cb(err);
                    });
                }
            },
            function(res,cb) {
                if (!cb && typeof(res) === "function") {
                    cb = res;
                }
                mailer("passwordreset","en_US",{code:reset_code,email:email,id:id,request:req},email,cb);
            }
        ],function (err) {
            var code = 400;
            if (err) {
                if (typeof(err) === 'number') {
                    code = err;
                } else if (err === "uninitialized" || err === "baddb") {
                    code = 500;
                }
                done(code,err);
            } else {
                done(201);
            }
        });
    },
    completePasswordResetByCode = function (req,done) {
        var code = req.body["code"],
            password = req.body["password"],
            passwordConfirm = req.body["passwordConfirm"]

        if(!code || code === ""){
            done(401,"Error. Password reset code must be provided.");
            return;
        }
        if(!password || password === ""){
            done(401,"Error. Password must be provided.");
            return;
        }
        if(!passwordConfirm || passwordConfirm === ""){
            done(401,"Error. Password confirmation must be provided.");
            return;
        }
        if(password !== passwordConfirm){
            done(401, "Error. Passwords provided do not match.");
            return;
        }

        var useId = true;
        async.waterfall([
            _getActivationCodeModel(code, useId),
            _getUser4ActivationCodeModel(),
            function(user, activationCode, cb){
                if(user){
                    req.user = user;
                    //change password of the user
                    model.changePassword(user._id, {password: password}, function(err, updatedUser){
                        //mark the code as expired
                        model.activationCodeModel.setExpired(activationCode._id, function(err, expiredCode){
                            cb(err, updatedUser);
                        });
                    });
                }else{
                    cb(new Error("User for specified reset code not found"));
                }
            }
        ],_finalizeActivationResponse(done));
    },

    completePasswordReset = function (req,done) {
        var reset_code = req.param("code"), password = req.param("password"), id = req.param("user"), now = new Date().getTime();
        async.waterfall([
            function (cb) {model.find(id,cb);},
            function (res,cb) {
                if (!res) {
                    cb(404);
                } else if (res.password_reset_code !== reset_code){
                    cb("invalidresetcode");
                } else if (res.password_reset_time < now) {
                    cb("expiredresetcode");
                } else if (!password) {
                    cb("missingpassword");
                } else {
                    model.save(idProperty?res[idProperty]:id,{password_reset_code:"X",password_reset_time:0,password:password},cb);
                }
            }
        ],function (err) {
            var code = 400;
            if (err) {
                if (err === 404) {
                    code = 404;
                } else if (err === "uninitialized") {
                    code = 500;
                }
                done(code,err);
            } else {
                done(200);
            }
        });
    };

module.exports = {
    init: function (config) {
        console.log("Config used in activator..");
        console.log(config);
        model = config.user || DEFAULTS.model;
        if(config.activationCodeModel){
            model = _.extend(model, {activationCodeModel: config.activationCodeModel});
        }
        url = config.url || DEFAULTS.url;
        templates = config.templates || DEFAULTS.templates;
        resetExpire = config.resetExpire || DEFAULTS.resetExpire;
        proto = config.protocol || DEFAULTS.proto;
        console.log("URL for emails is:" + url)
        console.log(proto);
        mailer = smtp(url,templates);
        emailProperty = config.emailProperty || DEFAULTS.emailProperty;
        idProperty = config.id || DEFAULTS.idProperty;
        codeLength = config.codeLength || DEFAULTS.codeLength;
    },
    createPasswordReset: function (req,res,next) {
        createPasswordReset(req,function (code,message) {
            res.send(code,message);
        });
    },
    createPasswordResetNext: function (req,res,next) {
        createPasswordReset(req,function (code,message) {
            req.activator = req.activator || {};
            _.extend(req.activator,{code:code,message:message});
            next();
        });
    },
    completePasswordReset: function (req,res,next) {
        completePasswordReset(req,function (code,message) {
            res.send(code,message);
        });
    },
    activatePasswordResetNext: function (req,res,next) {
        activatePasswordReset(req, function (code,actRes, activationCodeModel) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator,{code:code, message:actRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Activation Successful.", user: actRes, activationCodeModel: activationCodeModel});
            }
            next();
        });
    },
    completePasswordResetNext: function (req,res,next) {
        completePasswordResetByCode(req, function (code,passChangeRes) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator,{code:code, message:passChangeRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Password reset Successful.", user: passChangeRes});
            }
            next();
        });
    },
    createActivate: function (req,res,next) {
        createActivate(req,function (code,message) {
            res.send(code,message);
        });
    },
    createActivation: function (req,res,next) {
        createActivationByCode(req,function (code,message) {
            res.send(code, message);
        });
    },
    //TODO: consistence in handling data returned to caller
    createActivateNext: function (req,res,next) {
        createActivate(req,function (code,actRes) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator,{code:code,message:actRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Account Created Successfully.", user: actRes});
            }
            next();
        });
    },
    createActivationNext: function (req,res,next) {
        createActivationByCode(req,function(code,actRes) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator, {code:code, message:actRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Account Created Successfully.", user: actRes});
            }
            next();
        });
    },
    completeActivate: function (req,res,next) {
        completeActivate(req,function (code,message) {
            res.send(code,message);
        });
    },
    completeActivateNext: function (req,res,next) {
        //Cornix: added user to activator
        completeActivate(req,function (code,actRes) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator,{code:code,message:actRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Activation Successful.", user: actRes});
            }
            next();
        });
    },
    completeActivationNext: function (req,res,next) {
        //Cornix: added user to activator
        completeActivationByCode(req, function (code,actRes) {
            req.activator = req.activator || {};
            if(code !== 200){
                _.extend(req.activator,{code:code,message:actRes, user: req.user});
            } else{
                _.extend(req.activator,{code: code, message:"Activation Successful.", user: actRes});
            }
            next();
        });
    }
};