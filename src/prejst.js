/*!
 * prejst - underscore Template Compiler
 * https://github.com/piza/prejst
 * Released under the MIT, BSD, and GPL Licenses
 */

'use strict';

var version = require('../package.json').version;
//var AOTcompile = require('./AOTcompile.js');
var defaults = require('./defaults.js');
//var runtime = require('./runtime.js');
var uglify2 = require('./uglify2.js');
var stdout = require('./stdout.js');
var watch = require('./watch.js');
var path = require('./path.js');
var semver = require('semver');
var _ = require("./underscore.js");



var fs = require('fs');
var events = require('events');
var crypto = require('crypto');
var child_process = require('child_process');
var exec = child_process.exec;
//var execSync = child_process.execSync;

// 调试脚本
var DEBUG_File = '.debug.js';

// 缓存目录
var CACHE_DIR = '.cache';

var log = function (message) {
    console.log(message);
};

 
var Prejst = function (base, options) {


    // 模板项目路径
    this.base = path.resolve(base);


    // 项目配置选项
    this.options = options = this.getConfig(options);

    // 输出路径
    this.output = path.resolve(this.base, options.output);

    // 运行时输出路径
    this.runtime = path.resolve(this.output, options.runtime);

    // 编译结果存储
    this._cache = {};

    // 清理模板项目临时文件
    this._clear();

    // 初始化事件系统
    events.EventEmitter.call(this);

    // 监听模板修改事件
    this.on('change', function (data) {
        var time = (new Date).toLocaleTimeString();
        this.log('[grey]' + time + '[/grey]\n');
    });


    // 监听模板删除事件（Windows NodeJS 暂时无法做到）
    this.on('delete', function (data) {
        var time = (new Date).toLocaleTimeString();
        this.log('[grey]' + time + '[/grey]\n');
        this.log('[red]-[/red] ' + data.id + '\n');
    });


    // 监听模板加载事件
    this.on('load', function (error, data) {

        if (error) {
            this.log('[red]•[/red] ');
            this.log(data.id);
            return;
        }

        if (data.modified) {
            this.log('[green]•[/green] ');
        } else {
            this.log('[grey]•[/grey] ');
        }

        this.log(data.id);
    });


    // 监听模板编译事件
    this.on('compile', function (error, data) {

        if (error) {
            this.log(' [inverse][red]{{Syntax Error}}[/red][/inverse]\n\n');
        } else {

            this.log(this.options.debug ? ' [grey]<DEBUG>[/grey]' : '');
            this.log(' [grey]:v' + data.version + '[/grey]');
            this.log('\n');

        }


    });

    this.log("start build...\n");
    // 输出运行时 TODO: 这个时机需要优化
    //this.buildAll();
};


// 默认配置
// 用户配置将保存到模板根目录 package.json 文件中
Prejst.defaults = defaults;


Prejst.prototype = {

    __proto__: events.EventEmitter.prototype,


    // 获取用户配置
    getConfig: function () {

        var options = arguments[0];

        if (!options) {
            return this.options;
        }

        var file = path.join(this.base, 'package.json');

        var defaults = Prejst.defaults;
        var json = null;
        var name = null;
        var config = {};


        // 读取目录中 package.json
        if (fs.existsSync(file)) {
            var fileContent = fs.readFileSync(file, 'utf-8');

            if (fileContent) {
                json = JSON.parse(fileContent);
            }
        }


        if (!json) {

            json = {
                "name": 'template',
                "version": '1.0.0',
                "dependencies": {
                    "prejst": "1.0.0"
                },
                "prejst-config": {}
            };

        }

        //有些项目的package.json里只有devDependencies而没有dependencies
        //那么下面的replace那行代码就会出现can't read property 'tmodjs' of undefined的错误
        //这里添加容错逻辑
        
        if (!json.dependencies) {
            json.dependencies = json.devDependencies;
        }

        var targetVersion = json.dependencies.prejst.replace(/^~/, '');


        
        try {
            // 比较模板项目版本号
            if (semver.lt(version, targetVersion)) {
                this.log('[red]You must upgrade to the latest version of prejst![/red]\n');
                this.log('Local:  ' + version + '\n')
                this.log('Target: ' + targetVersion + '\n');
                process.exit(1);
            }
        } catch (e) {}



        // 更新模板项目的依赖版本信息
        json.dependencies.prejst = version;


        // 来自 Tmod.defaults
        for (name in defaults) {
            config[name] = defaults[name];
        }


        // 来自 package.json 文件
        for (name in json['prejst-config']) {
            config[name] = json['prejst-config'][name];
        }


        // 来自 Tmod(base, options) 的配置
        for (name in options) {
            if (options[name] !== undefined) {
                config[name] = options[name];
            }
        }


        config = this._fixConfig(config, defaults, json['prejst-config'], options);

        json['prejst-config'] = config;
        this['package.json'] = json;
        this.projectVersion = json.version;

        return config;
    },


    /**
     * 保存用户配置
     * @return  {String}    用户配置文件路径
     */
    saveConfig: function () {

        var file = path.join(this.base, 'package.json');
        var configName = 'prejst-config';
        var json = this['package.json'];

        var options = json[configName];
        var userConfigList = Object.keys(Prejst.defaults);


        // 只保存指定的字段
        json[configName] = JSON.parse(
            JSON.stringify(options, userConfigList)
        );


        var text = JSON.stringify(json, null, 4);


        fs.writeFileSync(file, text, 'utf-8');

        return file;
    },
// 编译运行时
    buildAll: function ( metadata, callback) {

        metadata = metadata || {};
        callback = callback || function () {};

        var error = null;
        var defineStr = 'define([], function() { var temp={};';
        var compileCode=this.compile();
        var endCode='\n return temp;})';
        var runtimeCode=defineStr+compileCode+endCode;
        runtimeCode = this._setMetadata(runtimeCode, metadata);
        this.log("start mkdir...\n");
        try {
            this._fsMkdir(path.dirname(this.runtime));
            fs.writeFileSync(this.runtime, runtimeCode, this.options.charset);
        } catch (e) {
            error = e;
        }


        //if (this.options.debug || !this.options.minify) {
        //    this._beautify(this.runtime);
        //} else {
        this._minify(this.runtime);
        //}

        callback.call(this, error, runtimeCode);
    },

    /**
     * 编译模板
     */
    compile: function () {
        var that = this;
        var walk = function (dir,packageName) {
            if (dir === that.output) {
                return '';
            }
            var result='';
            if(packageName!='temp'){
                result=result+' '+packageName+'={};';
            }
            var dirList = fs.readdirSync(dir);
            dirList.forEach(function (item) {
                if (fs.statSync(path.join(dir, item)).isDirectory()) {
                    result+=walk(path.join(dir, item),packageName+'.'+item);
                } else if (that.filterBasename(item) && that.filterExtname(item)) {
                    var prop=packageName+'.'+that._compile(path.join(dir, item))+';';
                    result+=prop;
                }
            });
            return result;
        };

        return walk(this.base,'temp');
    },
    // 编译单个模板
    // file: /Users/tangbin/Documents/web/tpl/index/main.html
    _compile: function (file) {
        // 模板字符串
        var source = '';
        try {
            source = fs.readFileSync(file, this.options.charset);
        } catch (e) {
            this.log("[inverse][red]"+e+"[red][inverse]");
        }
        var newMd5 = this._getMd5(source + JSON.stringify(this['package.json']));

        // 获取模板 ID
        var id = this._toId(file);
        try {
            return id+'='+_.template(source).source;
        } catch (e) {
            this.log("[inverse][red]"+e+"[red][inverse]");
        }
    },

    /**
     * 启动即时编译，监听文件修改自动编译
     */
    watch: function () {

        // 监控模板目录
        this.on('watch', function (data) {

            var type = data.type;
            var fstype = data.fstype;
            var target = data.target;

            if (target && fstype === 'file') {//

                if (type === 'delete') {

                    this.emit('delete', {
                        id: this._toId(target),
                        sourceFile: target
                    });

                } else if (/updated|create/.test(type)) {

                    this.emit('change', {
                        id: this._toId(target),
                        sourceFile: target
                    });

                }
            }

        });

    },
    /**
     * 名称筛选器
     * @param   {String}
     * @return  {Boolean}
     */
    filterBasename: function (name) {
        // 英文、数字、点、中划线、下划线的组合，且不能以点开头
        var FILTER_RE = /^\.|[^\w\.\-$]/;

        return !FILTER_RE.test(name);
    },


    /**
     * 后缀名筛选器
     * @param   {String}
     * @return  {Boolean}
     */
    filterExtname: function (name) {
        this.log("filterExtname:"+name+"\n");
        // 支持的后缀名
        var EXTNAME_RE = /\.(html|htm|jst)$/i;
        return EXTNAME_RE.test(name);
    },

    /**
     * 打印日志
     * @param   {String}    消息
     */
    log: function (message) {
        stdout(message);
    },


    // 修正配置-版本兼容
    _fixConfig: function (options, defaultsConfig, projectConfig, inputConfig) {

        var cwd = process.cwd();
        var base = this.base;

        // 模板合并规则
        // 兼容 0.0.3-rc3 之前的配置
        if (Array.isArray(options.combo) && !options.combo.length) {
            options.combo = false;
        } else {
            options.combo = !!options.combo;
        }


        // 兼容 0.1.0 之前的配置
        if (options.type === 'templatejs') {
            options.type = 'default';
        }


        // 根据生成模块的类型删除不支持的配置字段
        if (options.type === 'default' || options.type === 'global') {
            delete options.alias;
        } else {
            delete options.combo;
        }


        // 处理外部输入：转换成相对于 base 的路径

        if (inputConfig.output) {
            options.output = path.relative(base, path.resolve(cwd, inputConfig.output));
        }

        if (inputConfig.syntax && /\.js$/.test(inputConfig.syntax)) {// 值可能为内置名称：native || simple
            options.syntax = path.relative(base, path.resolve(cwd, inputConfig.syntax));
        }

        if (inputConfig.helpers) {
            options.helpers = path.relative(base, path.resolve(cwd, inputConfig.helpers));
        }


        return options;
    },


    // 文件写入
    _fsWrite: function (file, data, charset) {
        this._fsMkdir(path.dirname(file));
        fs.writeFileSync(file, data, charset || 'utf-8');
    },


    // 文件读取
    _fsRead: function (file, charset) {
        if (fs.existsSync(file)) {
            return fs.readFileSync(file, charset || 'utf-8');
        }
    },


    // 创建目录，包括子文件夹
    _fsMkdir: function (dir) {
        this.log("start _fsMkdir:"+dir+"\n");
        var currPath = dir;
        var toMakeUpPath = [];

        while (!fs.existsSync(currPath)) {
            toMakeUpPath.unshift(currPath);
            currPath = path.dirname(currPath);
        }

        toMakeUpPath.forEach(function (pathItem) {
            fs.mkdirSync(pathItem);
        });

    },


    // 删除文件夹，包括子文件夹
    _fsRmdir: function (dir) {

        var walk = function (dir) {

            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
                return;
            }

            var files = fs.readdirSync(dir);

            if (!files.length) {
                fs.rmdirSync(dir);
                return;
            } else {
                files.forEach(function (file) {
                    var fullName = path.join(dir, file);
                    if (fs.statSync(fullName).isDirectory()) {
                        walk(fullName);
                    } else {
                        fs.unlinkSync(fullName);
                    }
                });
            }

            fs.rmdirSync(dir);
        };

        walk(dir);
    },


    // 删除模板文件
    _fsUnlink: function (file) {
        return fs.existsSync(file) && fs.unlinkSync(file);
    },


    // 获取字符串 md5 值
    _getMd5: function (text) {
        return crypto.createHash('md5').update(text).digest('hex');
    },


    // 获取元数据
    _getMetadata: function (js) {
        var data = js.match(/\/\*PREJST\:(.*?)\*\//);
        if (data) {
            return JSON.parse(data[1]);
        }
    },

    // 删除元数据
    _removeMetadata: function (js) {
        var data = this._getMetadata(js) || {};
        var newText = '';

        // 文件末尾设置一个空注释，然后让 UglifyJS 不压缩它，避免很多文件挤成一行
        if (data.version) {
            newText = '/*v:' + data.version + '*/';
        }

        return js.replace(/^\/\*PREJST\:(?:.*)\*\//, newText);
    },


    // 设置元数据
    _setMetadata: function (js, data) {
        data = JSON.stringify(data || {});
        js = '/*PREJST:' + data + '*/\n' + js
        .replace(/\/\*PREJST\:(.*?)\*\//, '');
        return js;
    },


    _getUglifyOptions: function () {
        return {
            // require 变量是 AMD 、CMD 模块需要硬解析的字符
            reserved: 'require',
            // 忽略压缩的注释
            comments: '/PREJST\\:|^v\\:\\d+/',
            compress: {
                warnings: false
            }
        };
    },


    _uglify: function (file, options) {

        var result;

        try {
            result = uglify2(file, file, options);
        } catch (e) {
            var err = new Error('Uglification failed.');
            if (e.message) {
                err.message += '\n' + e.message + '. \n';
                if (e.line) {
                    err.message += 'Line ' + e.line + ' in ' + file + '\n';
                }
            }
            err.origError = e;
            console.log(err);
        }

        try {
            if (result) {
                fs.writeFileSync(file, result.output, this.options.charset);
            }
        } catch (e) {}
    },


    // 格式化 js
    _beautify: function (file) {
        var options = this._getUglifyOptions();
        options.mangle = false;
        options.beautify = true;
        this._uglify(file, options);
    },


    // 压缩 js
    _minify: function (file) {
        var options = this._getUglifyOptions();
        options.mangle = {};
        options.beautify = false;
        options.ascii_only = true;
        this._uglify(file, options);
    },


    // 路径转换为模板 ID
    // base: /Users/tangbin/Documents/web/tpl
    // file: /Users/tangbin/Documents/web/tpl/index/main.html
    // >>>>> main
    _toId: function (file) {
        var extname = path.extname(file);
        var id = file.replace(this.base + '/', '').replace(extname, '');
        if(id.indexOf(path.sep)){
            id=id.split(path.sep).pop();
        }
        return id;
    },




    // 计算字节长度
    _getByteLength: function (content) {
        return content.replace(/[^\x00-\xff]/gi, '--').length;
    },

    // 清理项目临时文件
    _clear: function () {
        // 删除上次遗留的调试文件
        this._fsUnlink(path.join(this.base, DEBUG_File));
        // 删除不必要的缓存目录
        if (!this.options.combo) {
            this._fsRmdir(path.join(this.output, CACHE_DIR));
        }

    }

};

module.exports = Prejst;

