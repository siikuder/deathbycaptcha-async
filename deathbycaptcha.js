const rp = require('request-promise');
const fs = require('fs');
const delay = require('delay');

const API_VERSION = 'DBC/NodeJS v4.6';
const HTTP_BASE_URL = 'http://api.dbcapi.me';
const HTTP_RESPONSE_TYPE = 'application/json';
const DEFAULT_TIMEOUT = 60;
const DEFAULT_TOKEN_TIMEOUT = 120;
const POLLS_INTERVAL = [1, 1, 2, 3, 2, 2, 3, 2, 2];
const DFLT_POLL_INTERVAL = 3;

class DeathByCaptcha {
    constructor(username, password, logs = false) {
        this.data = {
            username : username,
            password : password
        };
        this.log = logs;
    }

    headers() {
        return {
            'Accept' : HTTP_RESPONSE_TYPE,
            'User-Agent' : API_VERSION
        };
    }

    async getProfile() {
        try {
            const option = {
                url : HTTP_BASE_URL+'/api/user',
                method : 'POST',
                formData : this.data,
                headers : this.headers(),
                resolveWithFullResponse: true
            };
            const curl = await rp(option);
            return Promise.resolve({
                statusCode : curl.statusCode,
                msg : JSON.parse(curl.body)
            });
        } catch(err) {
            return Promise.resolve({
                statusCode : err.statusCode,
                error : err.error
            });
        }
    }

    async decode({captcha = null, timeout = null, extra = {}}) {
        if (!timeout) {
            if (!captcha) {
                timeout = DEFAULT_TOKEN_TIMEOUT;
            } else {
                timeout = DEFAULT_TIMEOUT;
            }
        }
        const deadline = Date.now() + (0 < timeout ? timeout : DEFAULT_TIMEOUT) * 1000;
        const doUpload = await this.upload({captcha : captcha, extra : extra});
        if(doUpload.statusCode === 303) {
            const int = 0;
            
            var isGet = true;
            while(isGet) {
                if(deadline > Date.now() && (!doUpload.error.text)) {
                    if (POLLS_INTERVAL.length > int) {
                        var intvl = POLLS_INTERVAL[int] * 1000;
                    } else {
                        var intvl = DFLT_POLL_INTERVAL * 1000;
                    }
                    const doGet = await this.getCaptcha(doUpload.error.captcha);
                    if(this.log === true) {
                        var date = new Date();
                        await fs.appendFileSync('logs_captcha.txt', `${date.getDate()}-${date.getMonth()}-${date.getFullYear()} ${date.getHours()}:${date.getSeconds()} => `+JSON.stringify(doGet)+"\n");
                    }
                    if(doGet.statusCode === 405 || doGet.statusCode === 500) {
                        return Promise.reject({
                            isValid : false,
                            statusCode : doGet.statusCode,
                            msg : doGet.msg
                        });
                    }
                    if(doGet.msg.is_correct === true && doGet.msg.text != "" && doGet.msg.text != "?") {
                        isGet = false;
                        return Promise.resolve({
                            isValid : true,
                            statusCode : doGet.statusCode,
                            msg : doGet.msg.text
                        });
                    }
                    if(doGet.msg.is_correct == false && doGet.msg.text == "?") {
                        isGet = false;
                        console.log(`Try to getting captcha..\n`);
                        await this.decode({extra : extra});
                    }
                    await delay(intvl);
                }
            }
        } else {
            console.log(`Captcha Error : ${doUpload.error}`);
            await this.decode({extra : extra});
        }
    }

    async getCaptcha(cid) {
        try {
            const option = {
                url : HTTP_BASE_URL+'/api/captcha/'+cid,
                method : 'GET',
                formData : this.data,
                headers : this.headers(),
                resolveWithFullResponse: true
            };
            const curl = await rp(option);
            return Promise.resolve({
                statusCode : curl.statusCode,
                msg : JSON.parse(curl.body)
            });
        } catch(err) {
            return Promise.resolve({
                statusCode : err.statusCode,
                error : err.error
            });
        }
    }

    async upload({captcha = null, extra = {}}) {
        const banner = (extra.banner ? extra.banner : null);
        var files = {};
        var datas = this.data;
        if (captcha) {
            datas['captchafile'] = 'base64:' + this.readImage(captcha);
        };
        if (banner) {
            datas['banner'] = 'base64:' + this.readImage(banner);
        };
        for(var entry in extra) {
            datas[entry] = extra[entry];
        }
        try {
            const option = {
                url : HTTP_BASE_URL+'/api/captcha',
                method : 'POST',
                formData : datas,
                headers : this.headers(),
                resolveWithFullResponse: true
            };
            const curl = await rp(option);
            return Promise.resolve({
                statusCode : curl.statusCode,
                msg : curl.body
            });
        } catch(err) {
            if(err.statusCode === 303) {
                return Promise.resolve({
                    statusCode : err.statusCode,
                    error : JSON.parse(err.error)
                });
            } else {
                return Promise.resolve({
                    statusCode : err.statusCode,
                    error : err.error
                });
            }
        }
    }

    async readImage(image) {
        const image_regex = RegExp('\.jpg$|\.png$|\.gif$|\.bmp$');
        const b64_regex = RegExp('^base64:');
        if (image_regex.test(image)) {
            return Promise.resolve(fs.readFileSync(image, {'encoding': 'base64'}));
        } else if (b64_regex.test(image)) {
            return Promise.resolve(image.substring(7));
        } else {
            return Promise.resolve(image.toString('base64'));
        }
    }
}