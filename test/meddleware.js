'use strict';


var test = require('tape'),
    express = require('express'),
    request = require('supertest'),
    meddle = require('../');


test('meddleware', function (t) {

    t.test('empty config', function (t) {
        var app;

        app = express();
        app.use(meddle(require('./fixtures/empty')));

        t.equal(app.stack.length, 3, 'app middleware stack length is default length');
        t.equal(app.stack[0].handle.name, 'query', 'middleware stack contains default "query" middleware');
        t.equal(app.stack[1].handle.name, 'expressInit', 'middleware stack contains default "expressInit" middleware');
        t.end();
    });


    t.test('built-in middleware config', function (t) {
        var config, names, child, parent;

        config = require('./fixtures/defaults');
        names = Object.keys(config);
        child = meddle(config);

        parent = express();
        parent.use(child);

        t.equal(child.stack.length, names.length + 2, 'middleware stack is appropriate length');
        names.forEach(function (name, i) {
            var handle = child.stack[i + 2].handle;
            t.equal(typeof handle, 'function', 'middleware is correctly defined');
            t.ok(handle.name.match(new RegExp(name, 'g')), 'middleware name is correct');
        });
        t.end();
    });


    t.test('mounting', function (t) {
        var parent, child;

        child = meddle(require('./fixtures/defaults'));
        child.on('mount', function (parent) {
            t.equal(parent.get('views'), child.get('views'), 'child app inherits parent settings');
            t.end();
        });

        parent = express();
        parent.set('views', './foo/bar');
        parent.use(child);
    });

});


test('priority', function (t) {

    t.test('no priority', function (t) {
        var config, child, parent, entry;

        config = require('./fixtures/no-priority');
        child = meddle(config);

        parent = express();
        parent.use(child);

        entry = child.stack[2];
        t.ok(entry, 'position 2 middleware exists');
        t.equal(typeof entry.handle, 'function', 'position 2 middleware is a function');
        t.equal(entry.handle.name, 'favicon', 'position 2 middleware has the expected name');

        entry = child.stack[3];
        t.ok(entry, 'position 3 middleware exists');
        t.equal(typeof entry.handle, 'function', 'position 3 middleware is a function');
        t.equal(entry.handle.name, 'staticMiddleware', 'position 3 middleware has the expected name');

        entry = child.stack[4];
        t.ok(entry, 'position 4 middleware exists');
        t.equal(typeof entry.handle, 'function', 'position 4 middleware is a function');
        t.equal(entry.handle.name, 'logger', 'position 4 middleware has the expected name');

        t.end();
    });

});


test('module', function (t) {

    t.test('module not defined', function (t) {
        var config = {
            "missing": {
                "enabled": true,
                "module": null
            }
        };

        t.throws(function() {
            var app;
            try {
                app = express();
                app.use(meddle(config));
            } catch (e) {
                t.ok(e instanceof TypeError, 'error is TypeError');
                t.equal(e.message, 'Module not defined.', 'error message specifies module is not defined');
                throw e;
            }
        });

        t.end();
    });


    t.test('missing module', function (t) {
        var app;
        t.throws(function() {
            try {
                app = express();
                app.use(meddle(require('./fixtures/missing')));
            } catch (e) {
                t.ok(e instanceof TypeError, 'error is TypeError');
                t.ok(e.message.match(/^Module not found:/ig), 'error message specified module is not found');
                throw e;
            }
        });

        t.end();
    });

});


test('factories', function (t) {

    t.test('custom middleware factories', function (t) {
        var config, names, child, parent;

        config = require('./fixtures/factories');
        names = Object.keys(config);
        child = meddle(config);

        parent = express();
        parent.use(child);

        t.equal(child.stack.length, names.length + 2, 'middleware stack is correct length');
        names.forEach(function (name, i) {
            var handle = child.stack[i + 2].handle;
            t.equal(typeof handle, 'function', 'position ' + i + ' middleware is a function');
            t.ok(handle.name, 'position ' + i + ' middleware has a name');
            t.ok(handle.name.match(new RegExp(name, 'g')), 'position ' + i + ' middleware name matches ' + name);
        });
        t.end();
    });


    t.test('throw on invalid identifier', function (t) {
        var config, app;

        config = require('./fixtures/invalid');

        t.throws(function () {
            try {
                app = express();
                app.use(meddle(config));
            } catch (e) {
                t.ok(e instanceof SyntaxError, 'error is SyntaxError');
                t.equal(e.message, 'Invalid identifier.', 'error message specifies invalid identifier');
                throw e;
            }
        }, SyntaxError);

        t.end();
    });

});


test('enabled', function (t) {

    t.test('only use enabled middleware', function (t) {
        var config, names, child, parent;

        config = require('./fixtures/enabled');
        names = Object.keys(config).filter(function (prop) {
            return config[prop].enabled;
        });

        child = meddle(config);
        parent = express();
        parent.use(child);

        t.equal(child.stack.length, 9, 'middleware stack is appropriate length');

        names.forEach(function (name, i) {
            var handle = child.stack[i + 2].handle;
            t.equal(typeof handle, 'function', 'position ' + i + ' middleware is a function');
            t.ok(handle.name, 'position ' + i + ' middleware has a name');
            t.ok(handle.name.match(new RegExp(name, 'g')), 'position ' + i + ' middleware name matches ' + name);
        });
        t.end();
    });


    t.test('disable middleware at runtime', function (t) {
        var config, app;

        config = require('./fixtures/toggle');
        app = express();
        app.use(meddle(config));

        t.equal(app.stack.length, 3, 'middleware stack is appropriate length');

        function req(cb) {
            var server;
            server = request(app)
                .get('/')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .end(function (err, res) {

                    t.error(err, 'no response error');
                    t.equal(typeof res, 'object', 'response is defined');
                    t.equal(typeof res.body, 'object', 'response body is defined');

                    server.app.close(function () {
                        cb(res.body);
                    });
                });
        }

        req(function (res) {
            t.equal(res.a, 'a', '"a" is defined');
            t.equal(res.b, 'b', '"b" is defined');

            // Disable middleware
            config.b.enabled = false;

            req(function (res) {
                t.equal(res.a, 'a', '"a" is still defined');
                t.equal(res.b, undefined, '"b" is no longer defined');
                t.end();
            });
        });

    });

});


test('events', function (t) {

    t.test('before and after registration events', function (t) {
        var config, app, events = 0;

        config = require('./fixtures/defaults');
        app = express();

        app.on('middleware:before', function () {
            events += 1;
        });

        app.on('middleware:after', function () {
            events += 1;
        });

        app.use(meddle(config));
        t.equal(events, 14, 'registration events were triggered');
        t.end();
    });


    t.test('before and after named registration events', function (t) {
        var config, events, child, parent;

        config = require('./fixtures/defaults');
        events = 0;
        child = meddle(config);
        parent = express();

        parent.on('middleware:before:favicon', function (eventargs) {
            t.equal(eventargs.app, child);
            events += 1;
        });

        parent.on('middleware:after:favicon', function (eventargs) {
            t.equal(eventargs.app, child);
            events += 1;
        });

        parent.use(child);
        t.equal(events, 2, 'registration events were triggered');
        t.end();
    });

});


test('routes', function (t) {

    t.test('route-specific middleware', function (t) {
        var config, app;

        function req(route, cb) {
            var server;
            server = request(app)
                .get(route)
                .end(function (err, res) {

                    t.error(err, 'no response error');
                    t.equal(typeof res, 'object', 'response is defined');
                    t.equal(typeof res.body, 'object', 'response body is defined');

                    server.app.close(function () {
                        cb(res.body);
                    });
                });
        }

        config = require('./fixtures/routes');

        app = express();
        app.use(meddle(config));

        app.get('/', function (req, res) {
            t.notOk(res.locals.routeA);
            t.ok(res.locals.routeB);
            t.notOk(res.locals.routeC);
            res.send(200);
        });

        app.get('/foo', function (req, res) {
            t.ok(res.locals.routeA);
            t.ok(res.locals.routeB);
            t.notOk(res.locals.routeC);
            res.send(200);
        });

        app.get('/bar', function (req, res) {
            t.notOk(res.locals.routeA);
            t.ok(res.locals.routeB);
            t.ok(res.locals.routeC);
            res.send(200);
        });

        // trololol
        req('/', function () {
            req('/foo', function () {
                req('/bar', function () {
                    t.end();
                });
            });
        });

    });

});