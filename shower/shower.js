/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.0
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    if(decl.state === DECL_STATES.IN_RESOLVING &&
                            curOptions.trackCircularDependencies &&
                            isDependenceCircular(decl, path)) {
                        cb(null, buildCircularDependenceError(decl, path));
                        return;
                    }

                    decls.push(decl);

                    startDeclResolving(
                        decl,
                        path,
                        function(_, error) {
                            if(error) {
                                cb(null, error);
                                return;
                            }

                            if(!--unresolvedDepsCnt) {
                                var exports = [],
                                    i = 0, decl;
                                while(decl = decls[i++]) {
                                    exports.push(decl.exports);
                                }
                                cb(exports);
                            }
                        });
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else {
                    decl.dependents.push(cb);
                }

                if(decl.state === DECL_STATES.IN_RESOLVING) {
                    return;
                }

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

/**
 * @fileOverview
 * Timer plugin for Shower.
 */
modules.define('shower-timer', [
    'event.Emitter',
    'util.extend',
    'util.bind'
], function (provide, EventEmitter, extend, bind) {

    var navigationPluginName = 'shower-navigation';

    /**
     * @class
     * Timer plugin for shower.
     * @name plugin.Timer
     * @param {Shower} shower
     * @constructor
     */
    function Timer (shower) {
        this.events = new EventEmitter();

        this._shower = shower;
        this._timer = null;

        this._showerListeners = null;
        this._playerListeners = null;
        this._pluginsListeners = null;
    }

    extend(Timer.prototype, /** @lends plugin.Timer.prototype */{

        init: function () {
            this._setupListeners();
        },

        destroy: function () {
            this._clearTimer();
            this._clearListeners();

            this._shower = null;
        },

        /**
         * @param {Integer} timing
         */
        run: function (timing) {
            this._initTimer(timing);
        },

        stop: function () {
            this._clearTimer();
        },

        _setupListeners: function () {
            var shower = this._shower;

            this.events
                .on('next', this._onNext, this);

            this._showerListeners = shower.events.group()
                .on('destroy', this.destroy, this);

            this._playerListeners = shower.player.events.group()
                .on('keydown', this._clearTimer, this)
                .on('activate', this._onSlideActivate, this);

            this._navigationPlugin = shower.plugins.get(navigationPluginName);
            if (!this._navigationPlugin) {
                this._pluginsListeners = this.shower.plugins.events.group()
                    .on('pluginadd', function (e) {
                        if (e.get('name') == navigationPluginName) {
                            this._navigationPlugin = shower.plugins.get(navigationPluginName);
                            this._pluginsListeners.offAll();
                        }
                    }, this);
            }

            if (shower.player.getCurrentSlideIndex() != -1) {
                this._onSlideActivate()
            }
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            this._playerListeners.offAll();
        },

        _onSlideActivate: function () {
            this._clearTimer();
            var currentSlide = this._shower.player.getCurrentSlide();

            if (this._shower.container.isSlideMode() && currentSlide.state.visited < 2) {
                var timing = currentSlide.getLayout().getData('timing');

                if (timing && /^(\d{1,2}:)?\d{1,3}$/.test(timing)) {
                    if (timing.indexOf(':') !== -1) {
                        timing = timing.split(':');
                        timing = (parseInt(timing[0], 10) * 60 + parseInt(timing[1], 10)) * 1000;
                    } else {
                        timing = parseInt(timing, 10) * 1000;
                    }
                    
                    if (timing !== 0) {
                        this._initTimer(timing);
                    }
                }
            }
        },

        _initTimer: function (timing) {
            var shower = this._shower,
                navigationPlugin = this._navigationPlugin;

            // Support inner navigation plugin.
            if (navigationPlugin && 
                navigationPlugin.getLength() && 
                navigationPlugin.getLength() != navigationPlugin.getComplete()) {

                timing = timing / (navigationPlugin.getLength() + 1);
            } 

            this._timer = setInterval(bind(function () {
                this.events.emit('next');
            }, this), timing);         
        },

        _clearTimer: function () {
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
        },

        _onNext: function () {
            this._clearTimer();
            this._shower.next();         
        }
    });

    provide(Timer);
});

modules.require(['shower'], function (shower) {
    shower.plugins.add('shower-timer');
});
/**
 * @fileOverview
 * Inner navigation shower plugin.
 */
modules.define('shower-navigation', [
    'event.Emitter',
    'util.extend',
    'util.bind'
], function (provide, EventEmitter, extend, bind) {

    var timerPluginName = 'shower-timer';

    /**
     * @class
     * @name plugin.Navigation
     * @param {Shower} shower
     * @param {Object} [options] Plugin options.
     * @param {String} [options.selector = '.next']
     * @constructor
     */
    function Navigation (shower, options) {
        options = options || {};
        this.events = new EventEmitter();

        this._shower = shower;
        this._elementsSelector = options.selector || '.next';
        this._elements = [];

        this._innerComplete = 0;
    }

    extend(Navigation.prototype, /** @lends plugin.Navigation.prototype */{

        init: function () {
            this._setupListeners();
            if (this._shower.player.getCurrentSlideIndex() != -1) {
                this._onSlideActivate();
            }
        },

        destroy: function () {
            this._clearListeners();

            this._elements = null;
            this._elementsSelector = null;
            this._innerComplete = null;
            this._shower = null;
        },

        /**
         * Activate next inner item.
         * @return {plugin.Navigation}
         */
        next: function () {
            if (!this._elements) {
                throw new Error('Inner nav elements not found.');
            }

            this._innerComplete++;
            this._go();

            this.events.emit('prev');
            return this;
        },

        prev: function () {
            this._innerComplete--;
            this._go();

            this.events.emit('next');
            return this;
        },

        /**
         * @returns {Number} Inner elements count.
         */
        getLength: function () {
            this._elements = this._getElements();
            return this._elements.length;
        },

        /**
         * @returns {Number} Completed inner elements count.
         */
        getComplete: function () {
            return this._innerComplete;
        },

        _setupListeners: function () {
            var shower = this._shower;

            this._showerListeners = shower.events.group()
                .on('destroy', this.destroy, this);

            this._playerListeners = shower.player.events.group()
                .on('activate', this._onSlideActivate, this)
                .on('next', this._onNext, this)
                .on('prev', this._onPrev, this);

            var timerPlugin = shower.plugins.get(timerPluginName);
            if (timerPlugin) {
                this._setupTimerPluginListener(timerPlugin);
            } else {
                this._pluginsListeners = shower.plugins.events.group()
                    .on('pluginadd', function (e) {
                        if (e.get('name') == timerPluginName) {
                            this._setupTimerPluginListener();
                            this._pluginsListeners.offAll();
                        }
                    }, this);
            }
        },

        _setupTimerPluginListener: function (plugin) {
            if (!plugin) {
                plugin = shower.plugins.get(timerPluginName);
            }
            plugin.events
                .on('next', this._onNext, this);
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            this._playerListeners.offAll();
        },

        _getElements: function () {
            var slideLayout = this._shower.player.getCurrentSlide().getLayout(),
                slideElement = slideLayout.getElement();

            return slideElement.querySelectorAll(this._elementsSelector);
        },

        _onNext: function (e) {
            var elementsLength = this._elements.length;
            if (this._shower.container.isSlideMode() && elementsLength && this._innerComplete < elementsLength) {
                e.preventDefault();
                this.next();
            }
        },

        _onPrev: function (e) { 
            var elementsLength = this._elements.length,
                isSlideMode = this._shower.container.isSlideMode();

            if (elementsLength && this._innerComplete < elementsLength && this._innerComplete > 0) {
                e.preventDefault();
                this.prev();
            }
        },

        _go: function () {
            for (var i = 0, k = this._elements.length; i < k; i++) {
                var element = this._elements[i];

                if (i < this._innerComplete) {
                    element.classList.add('active');
                } else {
                    element.classList.remove('active');
                }
            }
        },

        _onSlideActivate: function () {
            this._elements = this._getElements();
            this._elements = Array.prototype.slice.call(this._elements);

            this._innerComplete = this._getInnerComplete();
        },

        _getInnerComplete: function () {
            return this._elements.filter(function (element) {
                return element.classList.contains('active');
            }).length;
        }
    });

    provide(Navigation);
});

modules.require(['shower'], function (shower) {
    shower.plugins.add('shower-navigation');
});
/**
 * @fileOverview
 * Progress plugin for shower.
 */
modules.define('shower-progress', [
    'util.extend'
], function (provide, extend) {

    /**
     * @class
     * Progress plugin for shower.
     * @name plugin.Progress
     * @param {Shower} shower
     * @param {Object} [options] Plugin options.
     * @param {String} [options.selector = '.shower__progress']
     * @constructor
     */
    function Progress (shower, options) {
        options = options || {};
        this._shower = shower;
        this._playerListeners = null;

        this._element = null;
        this._elementSelector = options.selector || '.shower__progress';
    }

    extend(Progress.prototype, /** @lends plugin.Progress.prototype */{

        init: function () {
            var showerContainerElement = this._shower.container.getElement();
            this._element = showerContainerElement.querySelector(this._elementSelector);

            if (this._element) {
                this._setupListeners();
            }

            this._element.setAttribute('role', 'progressbar');
            this._element.setAttribute('aria-valuemin', '0');
            this._element.setAttribute('aria-valuemax', '100');

            this.updateProgress();
        },

        destroy: function () {
            this._clearListeners();
            this._shower = null;
        },

        updateProgress: function () {
            var slidesCount = this._shower.getSlidesCount(),
                currentSlideNumber = this._shower.player.getCurrentSlideIndex(),
                currentProgressValue = (100 / (slidesCount - 1)) * currentSlideNumber.toFixed(2);

            this._element.style.width = currentProgressValue + '%';
            this._element.setAttribute('aria-valuenow', currentProgressValue);
            this._element.setAttribute('aria-valuetext', 'Slideshow Progress: ' + currentProgressValue + '%');
        },

        _setupListeners: function () {
            var shower = this._shower;

            this._showerListeners = shower.events.group()
                .on('destroy', this.destroy, this);

            this._playerListeners = shower.player.events.group()
                .on('activate', this._onSlideChange, this);
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            this._playerListeners.offAll();
        },

        _onSlideChange: function () {
            this.updateProgress();
        }
    });

    provide(Progress);
});

modules.require(['shower'], function (shower) {
    shower.plugins.add('shower-progress');
});
/**
 * @fileOverview
 * Touch events plugin for shower.
 */
modules.define('shower-touch', [
    'util.extend'
], function (provide, extend) {

    /**
     * @class
     * Touch events plugin for shower.
     * @name plugin.Touch
     * @param {Shower} shower
     * @param {Object} [options] Plugin options.
     * @constructor
     */
    function Touch (shower, options) {
        options = options || {};
        this._shower = shower;

        // TODO: Gestures: pan, pinch, tap, swipe etc.
        // HammerJS?
        this._gestures = options.gestures;
    }

    extend(Touch.prototype, /** @lends plugin.Touch.prototype */{

        init: function () {
            this._setupListeners();
        },

        destroy: function () {
            this._clearListeners();
            this._shower = null;
        },

        _setupListeners: function () {
            var shower = this._shower;

            this._showerListeners = shower.events.group()
                .on('destroy', this.destroy, this);

            document.addEventListener('touchstart', this._onTouchStart.bind(this), false);
            document.addEventListener('touchmove', this._onTouchMove.bind(this), false);
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            document.removeEventListener('touchstart', this._onTouchStart.bind(this), false);
            document.removeEventListener('touchmove', this._onTouchMove.bind(this), false);
        },

        _onTouchStart: function (e) {
            var shower = this._shower,
                isSlideMode = shower.container.isSlideMode(),
                element = e.target,
                slide = this._getSlideByElement(element),
                x;

            if (slide) {
                if (isSlideMode && !this._isInteractiveElement(element)) {
                    x = e.touches[0].pageX;
                    if (x > window.innerWidth / 2) {
                        shower.next();
                    } else {
                        shower.prev();
                    }
                }

                if (!isSlideMode) {
                    // Go && turn on slide mode.
                    slide.activate();
                }
            }
        },

        _onTouchMove: function (e) {
            if (this._shower.container.isSlideMode()) {
                e.preventDefault();
            }
        },

        _getSlideByElement: function (element) {
            var slides = this._shower.getSlidesArray(),
                result = null;

            for (var i = 0, k = slides.length; i < k; i++) {
                if (element.id == slides[i].getId()) {
                    result = this._shower.get(i);
                    break;
                }
            }

            return result;
        },

        _isInteractiveElement: function (element) {
            return element.nodeType == 'A';
        }
    });

    provide(Touch);
});

modules.require(['shower'], function (shower) {
    shower.plugins.add('shower-touch');
});

/**
 * @fileOverview
 * Presenter notes plugin for shower.
 */
modules.define('shower-notes', [
    'util.extend'
], function (provide, extend) {

    /**
     * @class
     * Presenter notes plugin for shower.
     * @name plugin.Notes
     * @param {Shower} shower
     * @param {Object} [options] Plugin options.
     * @param {String} [options.selector = 'footer']
     * @constructor
     */
    function Notes (shower, options) {
        options = options || {};
        this._shower = shower;
        this._notesSelector = options.selector || 'footer';
    }

    extend(Notes.prototype, /** @lends plugin.Notes.prototype */{

        init: function () {
            this._setupListeners();
        },

        destroy: function () {
            this.clear();
            this._clearListeners();
            this._shower = null;
        },

        show: function () {
            this.clear();

            var shower = this._shower,
                slide = shower.player.getCurrentSlide(),
                slideLayout = slide.getLayout(),
                notes = slideLayout.getElement().querySelector(this._notesSelector);

            if (notes && notes.innerHTML) {
                console.info(notes.innerHTML.replace(/\n\s+/g, '\n'));
            }

            var currentSlideNumber = shower.player.getCurrentSlideIndex(),
                nextSlide = shower.get(currentSlideNumber + 1);

            if (nextSlide) {
                console.info('NEXT: ' + nextSlide.getTitle());
            }
        },

        clear: function () {
            if (this._shower.container.isSlideMode() && !this._shower.options.debugMode) {
                console.clear();
            }
        },

        _setupListeners: function () {
            var shower = this._shower;

            this._showerListeners = shower.events.group()
                .on('destroy', this.destroy, this);

            this._playerListeners = shower.player.events.group()
                .on('activate', this._onSlideActivate, this);
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            this._playerListeners.offAll();
        },

        _onSlideActivate: function () {
            this.show();
        }
    });

    provide(Notes);
});

modules.require(['shower'], function (shower) {
    shower.plugins.add('shower-notes');
});
(function () {
    var showerSelector = '.shower',
        optionsName = [
            'plugins',
            'debug',
            'slides',
            'hotkeys'
        ],
        options = {},
        plugins;

    document.addEventListener('DOMContentLoaded', function () {
        var element = document.querySelector(showerSelector),
            getData = function (name) {
                return element.dataset ?
                    element.dataset[name] :
                    element.getAttribute('data-' + name);
            };

        if (!element) {
            throw new Error('Shower element not found.');
        }

        if (getData('auto') != 'false') {
            if (window.hasOwnProperty('showerOptions')) {
                options = window.showerOptions;
            } else {
                optionsName.forEach(function (name) {
                    var value = getData(name);
                    // Null for getAttr, undefined for dataset.
                    if (value !== null && typeof value != 'undefined') {
                        options[name] = value;
                    }
                });
            }
            initShower();
        }
    }, false);

    function initShower () {
        modules.require(['shower'], function (shower) {
            shower.init(showerSelector, options);
        });
    }
})();
/**
 * @file Event emitter.
 */
modules.define('event.Emitter', [
    'event.Event',
    'event.EventGroup',
    'util.extend'
], function (provide, Event, EventGroup, extend) {

    /**
     * @class
     * @name event.Emitter
     *
     * Event emitter. Handle events, emit custom events and other.
     *
     * @param {object} [parameters]
     * @param {object} [parameters.context]
     */
    function EventEmitter (parameters) {
        this._parameters = parameters || {};
        this._parent = null;
        this._listeners = {};
    }

    extend(EventEmitter.prototype, /** @lends event.Emitter.prototype */ {

        /**
         * Add event (events) listener.
         *
         * @param {(string | string[])} types Event name or array of event names.
         * @param {function} callback
         * @param {object} [context] Callback context.
         * @returns {event.Emitter}
         */
        on: function (types, callback, context) {
            if (typeof types == 'string') {
                this._addListener(types, callback, context);
            } else {
                for (var i = 0, l = types.length; i < l; i++) {
                    this._addListener(types[i], callback, context);
                }
            }
            return this;
        },

        /**
         * Remove event (events) listener.
         *
         * @param {(string|string[])} types Event name or array of event names.
         * @param {function} callback
         * @param {object} [context] Callback context.
         * @returns {event.Emitter}
         */
        off: function (types, callback, context) {
            if (typeof types == 'string') {
                this._removeListener(types, callback, context);
            } else {
                for (var i = 0, l = types.length; i < l; i++) {
                    this._removeListener(types[i], callback, context);
                }
            }

            return this;
        },

        /**
         * Add event listener. Callback will run once and after remove auto.
         *
         * @param {(string|string[])} eventType Event name or array of event names.
         * @param {function} callback
         * @param {object} [context] Callback context.
         * @returns {event.Emitter}
         */
        once: function (eventType, callback, context) {
            var handler = function (event) {
                this.off(eventType, handler, this);
                if (context) {
                    callback.call(context, event);
                } else {
                    callback(event);
                }
            };
            this.on(eventType, handler, this);
            return this;
        },

        /**
         * Fire all handlers who listen that event type.
         *
         * @param {string} eventType
         * @param {(event.Event|object)} eventObject
         */
        emit: function (eventType, eventObject) {
            var event = eventObject;
            if (!event || typeof event.get != 'function') {
                event = this.createEventObject(eventType, eventObject, this._parameters.context);
            }

            if (!event.isPropagationStopped()) {
                if (this._listeners.hasOwnProperty(eventType)) {
                    this._callListeners(this._listeners[eventType], event);
                }

                if (this._parent && !event.isPropagationStopped()) {
                    this._parent.emit(eventType, event);
                }
            }
        },

        /**
         * @param {string} type
         * @param {object} eventData
         * @param {object} target
         */
        createEventObject: function (type, eventData, target) {
            var data = {
                target: target,
                type: type
            };

            return new Event(eventData ? extend(data, eventData) : data);
        },

        /**
         * @param {event.Emitter} parent
         */
        setParent: function (parent) {
            if (this._parent != parent) {
                this._parent = parent;
            }
        },

        /**
         * @returns {(event.Emitter|null)}
         */
        getParent: function () {
            return this._parent;
        },

        group: function () {
            return new EventGroup(this);
        },

        _addListener: function (eventType, callback, context) {
            var listener = {
                callback: callback,
                context: context
            };

            if (this._listeners[eventType]) {
                this._listeners[eventType].push(listener);
            } else {
                this._listeners[eventType] = [listener];
            }
        },

        _removeListener: function (eventType, callback, context) {
            var listeners = this._listeners[eventType];
            if (listeners) {
                var foundIndex = -1;
                for (var i = 0, l = listeners.lenght; i < l; i++) {
                    if (listeners[i].callback == callback && listeners[i].context == context) {
                        foundIndex = i;
                    }
                }

                if (foundIndex != -1) {
                    if (listeners.length == 1) {
                        this._clearType(eventType);
                    } else {
                        listeners.slice(foundIndex, 1);
                    }
                }
            }
        },

        /**
         * @ignore
         * @param {string} eventType
         */
        _clearType: function (eventType) {
            if (this._listeners.hasOwnProperty(eventType)) {
                delete this._listeners[eventType];
            }
        },

        _callListeners: function (listeners, event) {
            var i = listeners.length - 1;

            while (i >= 0 && !event.defaultPrevented()) {
                var listener = listeners[i];
                if (listener) {
                    if (listener.context) {
                        listener.callback.call(listener.context, event);
                    } else {
                        listener.callback(event);
                    }
                }
                i--;
            }
        }
    });

    provide(EventEmitter);
});

modules.define('event.Event', [
    'util.extend'
], function (provide, extend) {

    /**
     * @class
     * @name event.Event
     *
     * Event class. Can contains custom data.
     *
     * @param {object} data Custom event data.
     */
    function Event (data) {
        this._data = data;
        this._preventDefault = false;
        this._stopPropagation = false;
    }

    extend(Event.prototype, /** @lends event.Event.prototype */{
        /**
         * @param {string} key
         * @returns {object}
         */
        get: function (key) {
            return this._data[key];
        },

        preventDefault: function () {
            return this._preventDefault = true;
        },

        defaultPrevented: function () {
            return this._preventDefault;
        },

        stopPropagation: function () {
            return this._stopPropagation = true;
        },

        isPropagationStopped: function () {
            return this._stopPropagation;
        }
    });

    provide(Event);
});

modules.define('event.EventGroup', [
    'util.extend'
], function (provide, extend) {

    /**
     * @class
     * @name event.EventGroup
     *
     * Helper.
     * It is extend of event emitter for more comfortable work with it.
     *
     * @param {event.Emitter} eventManager
     *
     * @example
     * MyClass = function (shower) {
     *      this._shower = shower;
     *
     *      this._message = "Hello";
     *      this._showerListeners = null;
     * };
     *
     * MyClass.prototype.setupListeners = function () {
     *      this._showerListeners = this._shower.events.group()
     *          .on("next", function () { console.log(this._message); }, this)
     *          .on("prev", function () { console.log(this._message); }, this);
     * };
     *
     * MyClass.prototype.clearListeners = function () {
     *      this._showerListeners.offAll();
     * };
     */
    function EventGroup (eventManager) {
        this.events = eventManager;
        this._listeners = [];
    }

    extend(EventGroup.prototype, /** @lends event.EventGroup.prototype */ {
        /**
         * Add event listeners.
         *
         * @param {(string|string[])} types
         * @param {function} callback
         * @param {object} [context]
         * @returns {event.EventGroup}
         */
        on: function (types, callback, context) {
            if (Array.isArray(types)) {
                for (var i = 0, k = types.length; i < k; i++) {
                    this._listeners.push(types[i], callback, context);
                }
            } else {
                this._listeners.push(types, callback, context);
            }

            this.events.on(types, callback, context);

            return this;
        },

        /**
         * Remove event listeners.
         *
         * @param {(string|string[])} types
         * @param {function} callback
         * @param {object} context
         * @returns {event.EventGroup}
         */
        off: function (types, callback, context) {
            if (Array.isArray(types)) {
                for (var i = 0, k = types.length; i < k; i++) {
                    this._removeListener(types[i], callback, context);
                }
            } else {
                this._removeListener(types, callback, context);
            }

            return this;
        },

        /**
         * Remove all listeners.
         *
         * @returns {event.EventGroup}
         */
        offAll: function () {
            for (var i = 0, k = this._listeners.length; i < k; i += 3) {
                this.events.off(
                    this._listeners[i],
                    this._listeners[i + 1],
                    this._listeners[i + 2]
                );
            }
            this._listeners.length = 0;

            return this;
        },

        _removeListener: function (type, callback, context) {
            var index = this._listeners.indexOf(type, 0);
            while (index != -1) {
                if (this._listeners[index + 1] == callback &&
                    this._listeners[index + 2] == context) {
                    this._listeners.splice(index, 3);

                    this.events.off(type, callback, context);
                }

                index = this._listeners.indexOf(type, index);
            }
        }
    });

    provide(EventGroup);
});

/**
 * @file Core module of the Shower.
 */
modules.define('shower', [
    'event.Emitter',
    'shower.Container',
    'shower.parser',
    'shower.Player',
    'shower.Location',
    'shower.Plugins',
    'util.extend'
], function (provide, EventEmitter, Container, parser, Player, Location, Plugins, extend) {

    /**
     * @typedef {object} HTMLElement
     */

    /**
     * @typedef {function} ISlidesParseFunction
     * @param {HTMLElement} containerElement
     * @param {string} slide selector
     * @returns {Slide[]} slides
     */

    /**
     * @class
     * @name Shower
     *
     * Shower core.
     */
    function Shower () {
        this.events = new EventEmitter();
        this.options = {};

        this.plugins = new Plugins(this);
        this.container = null;
        this.player = null;

        this._slides = [];
        this._isReady = false;
        this._isHotkeysOn = true;
        this._liveRegion = null;
    }

    extend(Shower.prototype, /** @lends Shower.prototype */{
        /**
         * Init function.
         *
         * @param {(HTMLElement|string)} [containerElement = '.shower'] Container element or selector.
         * @param {object} [options] Shower options.
         * @param {boolean} [options.debug = false] Debug mode.
         * @param {boolean} [options.hotkeys = true] If true — hotkeys is work.
         * @param {string} [options.slide = '.shower > SECTION'] Slide selector.
         * @param {ISlidesParseFunction} [options.parser] Parse function.
         * @param {object} [options.plugins] Plugins options.
         * @returns {Shower}
         *
         * @example
         * modules.require(['shower'], function (shower) {
         *      shower.init(".mySlidesContainer", {
         *          slide: '.mySlidesContainer > SECTION',
         *          hotkeys: false
         *      });
         * });
         */
        init: function (containerElement, options) {
            containerElement = containerElement || '.shower';

            // Shower default options.
            this.options = extend({
                debug: false,
                hotkeys: true,
                slide: '.shower > SECTION',
                parser: parser,
                location: {
                    slideMode: 'full'
                },
                plugins: {}
            }, options);

            if (typeof containerElement == 'string') {
                containerElement = document.querySelector(containerElement);
            }

            this.container = new Container(this, containerElement);
            this.player = new Player(this);

            this._parseSlides();
            this._initLiveRegion();

            if (this.options.debug) {
                document.body.classList.add('debug');
                console.log('Debug mode on');
            }

            if (!this.options.hotkeys) {
                this.disableHotkeys();
            }

            this.location = new Location(this);

            this._isReady = true;
            this.events.emit('ready');

            return this;
        },

        /**
         * Destroy Shower.
         */
        destroy: function () {
            this.events.emit('destroy');

            this.location.destroy();
            this.container.destroy();
            this.player.destroy();
            this.plugins.destroy();

            this._slides.length = 0;
        },

        /**
         * Ready function will call callback when Shower init.
         * If Shower already initialized, callback will call immediately.
         *
         * @param {function} [callback] Your function that run after Shower initialized.
         * @returns {boolean} Ready state.
         */
        ready: function (callback) {
            if (callback) {
                if (this._isReady) {
                    callback();
                } else {
                    this.events.once('ready', callback);
                }
            }

            return this._isReady;
        },

        /**
         * Add slide or array of slides.
         *
         * @param {(Slide|Slide[])} slide Slide or array or slides.
         * @returns {Shower}
         */
        add: function (slide) {
            if (Array.isArray(slide)) {
                for (var i = 0, k = slide.length; i < k; i++) {
                    this._addSlide(slide[i]);
                }
            } else {
                this._addSlide(slide);
            }

            return this;
        },

        /**
         * Remove slide from shower.
         *
         * @param {(Slide|number)} slide Slide {@link Slide} or slide index.
         * @returns {Shower} Self link.
         */
        remove: function (slide) {
            var slidePosition;

            if (typeof slide == 'number') {
                slidePosition = slide;
            } else if (this._slides.indexOf(slide) != -1) {
                slidePosition = this._slides.indexOf(slide);
            } else {
                throw new Error('Slide not found');
            }

            slide = this._slides.splice(slidePosition, 1);

            this.events.emit('slideremove', {
                slide: slide
            });

            slide.destroy();
            return this;
        },

        /**
         * Return slide by index.
         *
         * @param {number} index Slide index.
         * @returns {Slide} Slide by index.
         */
        get: function (index) {
            return this._slides[index];
        },

        /**
         * @returns {Slide[]} Array with slides {@link Slide}.
         */
        getSlidesArray: function () {
            return this._slides.slice();
        },

        /**
         * @returns {number} Slides count.
         */
        getSlidesCount: function () {
            return this._slides.length;
        },

        /**
         * @borrows shower.Player.next
         * @returns {Shower}
         */
        next: function () {
            this.player.next();
            return this;
        },

        /**
         * @borrows shower.Player.prev
         * @returns {Shower}
         */
        prev: function () {
            this.player.prev();
            return this;
        },

        /**
         * @borrows shower.Player.first
         * @returns {Shower}
         */
        first: function () {
            this.player.first();
            return this;
        },

        /**
         * @borrows shower.Player.last
         * @returns {Shower}
         */
        last: function () {
            this.player.last();
            return this;
        },

        /**
         * @borrows shower.Player.go
         * @returns {Shower}
         */
        go: function (index) {
            this.player.go(index);
            return this;
        },

        /**
         * Turn off hotkeys control.
         *
         * @returns {Shower}
         */
        disableHotkeys: function () {
            this._isHotkeysOn = false;
            return this;
        },

        /**
         * Turn on hotkeys control.
         *
         * @returns {Shower}
         */
        enableHotkeys: function () {
            this._isHotkeysOn = true;
            return this;
        },

        /**
         * @returns {boolean} Hotkeys is enabled.
         */
        isHotkeysEnabled: function () {
            return this._isHotkeysOn;
        },

        /**
         * @returns {HTMLElement} Live region element.
         */
        getLiveRegion: function () {
            return this._liveRegion;
        },

        /**
         * Update live region content.
         *
         * @param {string} content New content for live region.
         * @returns {Shower}
         */
        updateLiveRegion: function (content) {
            this._liveRegion.innerHTML = content;
            return this;
        },

        _parseSlides: function () {
            var slides = this.options.parser(this.container.getElement(), this.options.slide);
            this.add(slides);
        },

        _addSlide: function (slide) {
            slide.state.index = this._slides.length;
            this._slides.push(slide);

            // TODO: ?
            // slide.setParent(this);

            this.events.emit('slideadd', {
                slide: slide
            });
        },

        _initLiveRegion: function () {
            var liveRegion = document.createElement('section');
            liveRegion.setAttribute('role', 'region');
            liveRegion.setAttribute('aria-live', 'assertive');
            liveRegion.setAttribute('aria-relevant', 'additions');
            liveRegion.setAttribute('aria-label', 'Slide Content: Auto-updating');
            liveRegion.className = 'shower__live-region';

            document.body.appendChild(liveRegion);
            this._liveRegion = liveRegion;
        }
    });

    provide(new Shower());
});

/**
 * @file Container class for shower slides.
 */
modules.define('shower.Container', [
    'event.Emitter',
    'util.bind',
    'util.extend'
], function (provide, EventEmitter, bind, extend) {

    var CSS_CLASSES = {
        full: 'shower--full',
        list: 'shower--list'
    };

    /**
     * @typedef {object} HTMLElement
     */

    /**
     * @class
     * @name shower.Container
     *
     * Container class for shower slides. Contains DOM,
     * enter & exit slide mode.
     *
     * @param {Shower} shower Shower.
     * @param {HTMLElement} containerElement Container element.
     */
    function Container (shower, containerElement) {
        this.events = new EventEmitter();

        this._shower = shower;
        this._element = containerElement;
        this._isSlideMode = false;

        this.init();
    }

    extend(Container.prototype, /** @lends shower.Container.prototype */{

        init: function () {
            this._setupListeners();
        },

        destroy: function () {
            this._clearListeners();
            this._element = null;
            this._shower = null;
            this._isSlideMode = null;
        },

        /**
         * @returns {HTMLElement} Container element.
         */
        getElement: function () {
            return this._element;
        },

        /**
         * Enter slide mode.
         * Slide fills the maximum area.
         *
         * @returns {shower.Container}
         */
        enterSlideMode: function () {
            var bodyClassList = document.body.classList;
            bodyClassList.remove(CSS_CLASSES.list);
            bodyClassList.add(CSS_CLASSES.full);

            this._applyTransform(this._getTransformScale());

            if (!this._isSlideMode) {
                this._isSlideMode = true;
                this._shower.location.save();
            }

            this._isSlideMode = true;
            this.events.emit('slidemodeenter');

            return this;
        },

        /**
         * Exit slide mode.
         * Shower returns into list mode.
         *
         * @returns {shower.Container}
         */
        exitSlideMode: function () {
            var elementClassList = document.body.classList;
            elementClassList.remove(CSS_CLASSES.full);
            elementClassList.add(CSS_CLASSES.list);

            this._applyTransform('none');

            if (this._isSlideMode) {
                this._isSlideMode = false;
                this._shower.location.save();
                this.scrollToSlide(this._shower.player.getCurrentSlideIndex());
            }

            this._isSlideMode = false;
            this.events.emit('slidemodeexit');

            return this;
        },

        /**
         * Return state of slide mode.
         *
         * @returns {Boolean} Slide mode state.
         */
        isSlideMode: function () {
            return this._isSlideMode;
        },

        /**
         * Scroll to slide by index.
         *
         * @param {Number} slideIndex
         * @returns {shower.Container}
         */
        scrollToSlide: function (slideIndex) {
            var slide = this._shower.get(slideIndex),
                slideElement;

            if (!slide) {
                throw new Error('There is no slide with index ' + slideIndex);
            }

            slideElement = slide.getLayout().getElement();
            window.scrollTo(0, slideElement.offsetTop);

            return this;
        },

        _setupListeners: function () {
            this._showerListeners = this._shower.events.group()
                .on('slideadd', this._onSlideAdd, this)
                .on('slideremove', this._onSlideRemove, this);

            window.addEventListener('resize', bind(this._onResize, this));
            document.addEventListener('keydown', bind(this._onKeyDown, this));
        },

        _clearListeners: function () {
            this._showerListeners.offAll();
            window.removeEventListener('resize', bind(this._onResize, this));
            document.removeEventListener('keydown', bind(this._onKeyDown, this));
        },

        _getTransformScale: function () {
            var denominator = Math.max(
                document.body.clientWidth / window.innerWidth,
                document.body.clientHeight / window.innerHeight
            );

            return 'scale(' + (1 / denominator) + ')';
        },

        _applyTransform: function (transformValue) {
            [
                'WebkitTransform',
                'MozTransform',
                'msTransform',
                'OTransform',
                'transform'
            ].forEach(function (property) {
                document.body.style[property] = transformValue;
            });
        },

        _onResize: function () {
            if (this.isSlideMode()) {
                this._applyTransform(this._getTransformScale());
            }
        },

        _onSlideAdd: function (e) {
            var slide = e.get('slide');
            slide.events
                .on('click', this.enterSlideMode, this);
        },

        _onSlideRemove: function (e) {
            var slide = e.get('slide');
            slide.events
                .off('click', this.enterSlideMode, this);
        },

        _onKeyDown: function (e) {
            if (!this._shower.isHotkeysEnabled()) {
                return;
            }

            switch (e.which) {
                case 13: // enter
                    e.preventDefault();
                    this.enterSlideMode();
                    break;

                case 27: // esc
                    e.preventDefault();
                    this.exitSlideMode();
                    break;

                case 116: // F5 (Shift)
                    e.preventDefault();
                    if (!this.isSlideMode()) {
                        var slideNumber = e.shiftKey ? this._shower.player.getCurrentSlideIndex() : 0;
                        this._shower.go(slideNumber);
                        this.enterSlideMode();
                    } else {
                        this.exitSlideMode();
                    }

                    break;

                case 80: // P Alt Cmd
                    if (!this.isSlideMode() && e.altKey && e.metaKey) {
                        e.preventDefault();
                        this.enterSlideMode();
                    }
                    break;
            }
        }
    });

    provide(Container);
});

/**
 * @file History controller for shower.
 */
modules.define('shower.Location', [
    'util.bind',
    'util.extend'
], function (provide, bind, extend) {

    /**
     * @typedef {object} slideInfo
     * @property {Slide} slide Slide instance.
     * @property {number} index Slide index.
     */

    /**
     * @class
     * @name shower.Location
     *
     * @param {Shower} shower
     */
    function Location (shower) {
        this._shower = shower;

        this._showerListeners = null;
        this._playerListeners = null;
        this._documentTitle = document.title;

        var supported = !!(window.history && window.history.pushState);
        if (supported) {
            this.init();
        }
    }

    extend(Location.prototype, /** @lends shower.Location.prototype */{
        init: function () {
            this._setupListeners();
            this._shower.ready(bind(this._init, this));
        },

        destroy: function () {
            this._clearListeners();
        },

        /**
         * Push to history custom content.
         *
         * @param {string} content
         */
        push: function (content) {
            var url = window.location;
            window.history.pushState({}, null, url.pathname + content);
        },

        /**
         * Save current Shower state, e.g.:
         * - slide (index or id);
         * - slide mode.
         */
        save: function () {
            window.history.pushState({}, null, this._getCurrentURL());
        },

        _getCurrentURL: function (slide) {
            var shower = this._shower,
                currentSlideId = shower.player.getCurrentSlide().getId(),
                isSlideMode = shower.container.isSlideMode();

            return window.location.pathname +
                (isSlideMode ? '?' + shower.options.location.slideMode : '') +
                '#' + currentSlideId
        },

        _init: function () {
            var shower = this._shower,
                currentSlideId = window.location.hash.substr(1),
                currentSlideIndex = 0,
                slideInfo;

            if (currentSlideId != '') {
                slideInfo = this._getSlideById(currentSlideId);
                window.location.hash = '';
                shower.go(typeof slideInfo.index != 'undefined' ?
                    slideInfo.index :
                    currentSlideIndex
                );
            }

            if (this._isSlideMode()) {
                shower.container.enterSlideMode();
            }
        },

        _setupListeners: function () {
            var shower = this._shower;

            this._playerListeners = shower.player.events.group()
                .on('activate', this._onSlideActivate, this);

            this._containerListener = shower.container.events.group()
                .on(['slidemodeenter', 'slidemodeexit'], this._setTitle, this);

            window.addEventListener('popstate', bind(this._onPopstate, this));
        },

        _clearListeners: function () {
            window.removeEventListener('popstate', bind(this._onPopstate, this));
            this._playerListeners.offAll();
            this._containerListener.offAll();
        },

        /**
         * @ignore
         * @param {string} slideId
         * @return {slideInfo} Slide info object.
         */
        _getSlideById: function (slideId) {
            var slides = this._shower.getSlidesArray(),
                slide,
                index;

            for (var i = slides.length - 1; i >= 0; i--) {
                if (slides[i].getId() == slideId) {
                    slide = slides[i];
                    index = i;
                    break;
                }
            }

            return {
                slide: slide,
                index: index
            };
        },

        _onSlideActivate: function (e) {
            window.location.hash = e.get('slide').getId();
            this._setTitle();
        },

        _isSlideMode: function () {
            var slideModeUrl = this._shower.options.location.slideMode,
                regExp = new RegExp('^' + slideModeUrl + '.*');

            return regExp.test(window.location.search.substr(1));
        },

        _onPopstate: function () {
            var shower = this._shower,
                showerContainer = shower.container,
                slideId = window.location.hash.substr(1),
                slideInfo,
                currentSlide = shower.player.getCurrentSlide(),
                currentSlideNumber = shower.player.getCurrentSlideIndex(),
                isSlideMode = this._isSlideMode();

            // Go to first slide, if hash id is invalid or isn't set.
            // Same check is located in DOMContentLoaded event,
            // but it not fires on hash change
            if (isSlideMode && currentSlideNumber === -1) {
                shower.go(0);
            // In List mode, go to first slide only if hash id is invalid.
            } else if (currentSlideNumber === -1 && window.location.hash !== '') {
                shower.go(0);
            }

            if (currentSlide && slideId != currentSlide.getId()) {
                slideInfo = this._getSlideById(slideId);
                shower.go(slideInfo.index);
            }

            if (!isSlideMode) {
                showerContainer.exitSlideMode();
            } else {
                showerContainer.enterSlideMode();
            }
        },

        _setTitle: function () {
            var title = document.title,
                isSlideMode = this._isSlideMode(),
                currentSlide = this._shower.player.getCurrentSlide();

            if (isSlideMode && currentSlide) {
                var slideTitle = currentSlide.getTitle();
                if (slideTitle) {
                    document.title = slideTitle + ' — ' + this._documentTitle;
                } else {
                    document.title = this._documentTitle;
                }
            } else if (this._documentTitle != title) {
                document.title = this._documentTitle
            }
        }
    });

    provide(Location);
});

/**
 * @file Slides player.
 */
modules.define('shower.Player', [
    'event.Emitter',
    'util.bind',
    'util.extend'
], function (provide, EventEmitter, bind, extend) {

    /**
     * @class
     * @name shower.Player
     *
     * Control slides.
     *
     * @param {Shower} shower Shower.
     */
    function Player (shower) {
        this.events = new EventEmitter();

        this._shower = shower;
        this._currentSlideNumber = -1;
        this._currentSlide = null;

        this.init();
    }

    extend(Player.prototype, /** @lends shower.Player.prototype */ {

        init: function () {
            var shower = this._shower;

            this._showerListeners = shower.events.group()
                .on('slideadd', this._onSlideAdd, this)
                .on('slideremove', this._onSlideRemove, this);

            this._playerListeners = this.events.group()
                .on('prev', this._onPrev, this)
                .on('next', this._onNext, this);

            document.addEventListener('keydown', bind(this._onKeyDown, this));
        },

        destroy: function () {
            this._showerListeners.offAll();
            this._playerListeners.offAll();

            document.removeEventListener('keydown', bind(this._onKeyDown, this));

            this._currentSlide = null;
            this._currentSlideNumber = null;
            this._shower = null;
        },

        /**
         * Go to next slide.
         *
         * @returns {shower.Player}
         */
        next: function () {
            this.events.emit('next');
            return this;
        },

        /**
         * Go to previous slide.
         *
         * @returns {shower.Player}
         */
        prev: function () {
            this.events.emit('prev');
            return this;
        },

        /**
         * Go to first slide.
         *
         * @returns {shower.Player}
         */
        first: function () {
            this.go(0);
            return this;
        },

        /**
         * Go to last slide.
         *
         * @returns {shower.Player}
         */
        last: function () {
            this.go(this._shower.getSlidesCount() - 1);
            return this;
        },

        /**
         * Go to custom slide by index.
         *
         * @param {number} index Slide index to activate.
         * @returns {shower.Player}
         */
        go: function (index) {
            var slidesCount = this._shower.getSlidesCount(),
                currentSlide = this._currentSlide;

            if (index != this._currentSlideNumber && index < slidesCount && index >= 0) {
                if (currentSlide && currentSlide.isActive()) {
                    currentSlide.deactivate();
                }

                currentSlide = this._shower.get(index);

                this._currentSlide = currentSlide;
                this._currentSlideNumber = index;

                if (!currentSlide.isActive()) {
                    currentSlide.activate();
                }

                this._shower.updateLiveRegion(currentSlide.getContent());

                this.events.emit('activate', {
                    index: index,
                    slide: currentSlide
                });
            }

            return this;
        },

        /**
         * @returns {Slide} Current active slide.
         */
        getCurrentSlide: function () {
            return this._currentSlide;
        },

        /**
         * @returns {Number} Current active slide index.
         */
        getCurrentSlideIndex: function () {
            return this._currentSlideNumber;
        },

        _onPrev: function () {
            this._changeSlide(this._currentSlideNumber - 1);
        },

        _onNext: function () {
            this._changeSlide(this._currentSlideNumber + 1);
        },

        /**
         * @ignore
         * @param {number} index Slide index.
         */
        _changeSlide: function (index) {
            this.go(index);
        },

        _onSlideAdd: function (e) {
            var slide = e.get('slide');

            slide.events
                .on('activate', this._onSlideActivate, this);
        },

        _onSlideRemove: function (e) {
            var slide = e.get('slide');

            slide.events
                .off('activate', this._onSlideActivate, this);
        },

        _onSlideActivate: function (e) {
            var slide = e.get('slide'),
//                slideNumber = slide.state.index;
                slideNumber = this._shower.getSlidesArray().indexOf(slide);

            this.go(slideNumber);
        },

        _onKeyDown: function (e) {
            if (!this._shower.isHotkeysEnabled()) {
                return;
            }

            this.events.emit('keydown', {
                event: e
            });

            switch (e.which) {
                case 33: // PgUp
                case 38: // Up
                case 37: // Left
                case 72: // H
                case 75: // K
                    if (e.altKey || e.ctrlKey || e.metaKey) { return; }
                    e.preventDefault();
                    this.prev();
                    break;

                case 34: // PgDown
                case 40: // Down
                case 39: // Right
                case 76: // L
                case 74: // J
                    if (e.altKey || e.ctrlKey || e.metaKey) { return; }
                    e.preventDefault();
                    this.next();
                    break;

                case 36: // Home
                    e.preventDefault();
                    this.first();
                    break;

                case 35: // End
                    e.preventDefault();
                    this.last();
                    break;

                case 9: // Tab (Shift)
                case 32: // Space (Shift)
                    if (e.altKey || e.ctrlKey || e.metaKey) { return; }
                    e.preventDefault();

                    if (e.shiftKey) {
                        this.prev();
                    } else {
                        this.next();
                    }
                    break;
            }
        }
    });

    provide(Player);
});

/**
 * @file Plugins controller for Shower.
 */
modules.define('shower.Plugins', [
    'event.Emitter',
    'util.bind',
    'util.extend'
], function (provide, EventEmitter, bind, extend) {

    /**
     * @class
     * @name shower.Plugins
     *
     * Plugins controller for Shower.
     *
     * @param {Shower} shower
     */
    function Plugins (shower) {
        this.events = new EventEmitter();

        this._shower = shower;
        this._isReady = true;
        this._plugins = {};
        this._waiting = [];

        this.init();
    }

    extend(Plugins.prototype, /** @lends shower.Plugins.prototype */ {

        init: function () {
            this._shower.events
                .once('ready', this._onShowerReady, this);
        },

        destroy: function () {
            this._plugins = null;
            this._waiting.length = 0;
            this._shower = null;
        },

        /**
         * Add plugin to the Shower plugins system.
         * After add plugin, auto:
         * — instance plugin;
         * — call init method for setup plugin.
         *
         * @param {string} name Plugin module name.
         * @param {object} [pluginOptions] Custom options for plugin.
         * @returns {shower.Plugins}
         */
        add: function (name, pluginOptions) {
            if (this._plugins[name]) {
                throw new Error('Plugin ' + name + ' already exist');
            }

            // If options not found, get defaults options from Shower plugin options.
            var plugin = {
                name: name,
                options: pluginOptions
            };

            this._requirePlugin(plugin);
            return this;
        },

        /**
         * Remove plugin from system.
         *
         * @param {String} name
         * @returns {shower.Plugins}
         */
        remove: function (name) {
            if (!this._plugins[name]) {
                throw new Error('Plugin ' + name + ' not found');
            }

            delete this._plugins[name];
            this.events.emit('pluginremove', {
                name: name
            });

            return this;
        },

        /**
         * Get plugin by name.
         *
         * @param {string} name Plugin name.
         * @returns {object} Plugin.
         */
        get: function (name) {
            return this._plugins[name];
        },

        _addPlugin: function (plugin) {
            if (this._isReady) {
                this._instancePlugins(plugin);
            } else {
                this._waiting.push(plugin);
            }
        },

        _instancePlugins: function (pluginInfo) {
            var name = pluginInfo.name,
                showerOptions = this._shower.options,
                // If options not found, get defaults options from Shower plugin options.
                options = pluginInfo.options || showerOptions.plugins && showerOptions.plugins[name],
                plugin = new pluginInfo.class(this._shower, options);

            this._plugins[name] = plugin;

            this.events.emit('pluginadd', {
                name: name
            });

            if (this._isReady) {
                setTimeout(function () {
                    plugin.init();
                }, 0);
            }
        },

        _onShowerReady: function () {
            if (this._waiting.length) {
                this._waiting.forEach(this._instancePlugins, this);
                this._initPlugins();
            }

            this._isReady = true;
        },

        _initPlugins: function () {
            var plugins = this._plugins;
            for (var pluginName in plugins) {
                if (plugins.hasOwnProperty(pluginName)) {
                    plugins[pluginName].init();
                }
            }
        },

        _requirePlugin: function (plugin) {
            modules.require([plugin.name], bind(function (pluginClass) {

                extend(plugin, {
                    class: pluginClass
                });

                this._addPlugin(plugin);
            }, this));
        }
    });

    provide(Plugins);
});

modules.define('shower.parser', [
    'Slide'
], function (provide, Slide) {

    /**
     * @typedef {object} HTMLElement
     */

    /**
     * @function
     * @static
     * @name shower.parser.
     *
     * @param {HTMLElement} containerElement
     * @param {string} cssSelector
     * @returns {Slide[]}
     */
    function parse (containerElement, cssSelector) {
        var slides = [],
            slidesElements = containerElement.querySelectorAll(cssSelector);

        slidesElements = Array.prototype.slice.call(slidesElements);

        for (var i = 0, l = slidesElements.length; i < l; i++) {
            var slideElement = slidesElements[i],
                slide = new Slide(slideElement);

            if (!slideElement.id) {
                slideElement.id = i + 1;
            }

            slides.push(slide);
        }

        return slides;
    }

    provide(parse);
});

/**
 * @file Slide.
 */
modules.define('Slide', [
    'event.Emitter',
    'slide.Layout',
    'slide.layoutFactory',
    'util.extend'
], function (provide, EventEmitter, Layout, slideLayoutFactory, extend) {

    /**
     * @typedef {object} HTMLElement
     */

    /**
     * @class
     * @name Slide
     *
     * Slide class.
     *
     * @param {(string|HTMLElement)} content
     * @param {object} [options]
     * @param {object} [state] Current slide state.
     * @param {number} [state.visited=0] Count of visit slide.
     * @param {(number|null)} [state.index=null] Slide index.
     */
    function Slide (content, options, state) {
        this.events = new EventEmitter();
        this.options = extend({
            // default options
        }, options);

        this.state = extend({
            visited: 0,
            index: null
        });

        this._content = content;
        this._isActive = false;
        this._isVisited = false;

        this.init();
    }

    extend(Slide.prototype, /** @lends Slide.prototype */ {

        init: function () {
            this._layout = typeof this._content == 'string' ?
                new slideLayoutFactory.createLayout(this._content) :
                new Layout(this._content);

            this._layout.setParent(this);

            this._setupListeners();
        },

        destroy: function () {
            this._clearListeners();

            this._isActive = null;
            this.options = null;

            this._layout.destroy();
        },

        /**
         * Activate slide.
         *
         * @returns {Slide}
         */
        activate: function () {
            this._isActive = true;

            this.state.visited++;
            this.events.emit('activate', {
                slide: this
            });

            return this;
        },

        /**
         * Deavtivate slide.
         *
         * @returns {Slide}
         */
        deactivate: function () {
            this._isActive = false;
            this.events.emit('deactivate', {
                slide: this
            });

            return this;
        },

        /**
         * Get active state.
         *
         * @returns {boolean}
         */
        isActive: function () {
            return this._isActive;
        },

        /**
         * Get visited state.
         *
         * @returns {boolean}
         */
        isVisited: function () {
            return this.state.visited > 0;
        },

        /**
         * Get slide layout.
         *
         * @returns {slide.Layout}
         */
        getLayout: function () {
            return this._layout;
        },

        /**
         * Get slide title.
         *
         * @borrows slide.Layout.getTitle
         */
        getTitle: function () {
            return this._layout.getTitle();
        },

        /**
         * Set slide title.
         *
         * @borrows slide.Layout.getTitle
         * @returns {Slide}
         */
        setTitle: function (title) {
            this._layout.setTitle(title);
            return this;
        },

        /**
         * Get id of slide element.
         *
         * @returns {(string|undefined)}
         */
        getId: function () {
            return this._layout.getElement().id;
        },

        /**
         * Get slide content.
         *
         * @borrows slide.Layout.getContent
         */
        getContent: function () {
            return this._layout.getContent();
        },

        _setupListeners: function () {
            this._layoutListeners = this._layout.events.group()
                .on('click', this._onSlideClick, this);
        },

        _clearListeners: function () {
            this._layoutListeners.offAll();
        },

        _onSlideClick: function () {
            this.activate();

            this.events.emit('click', {
                slide: this
            });
        }
    });

    provide(Slide);
});

/**
 * @file Slide layout.
 */
modules.define('slide.Layout', [
    'event.Emitter',
    'util.bind',
    'util.extend'
], function (provide, EventEmitter, bind, extend) {

    var CSS_CLASSES = {
            active: 'active',
            visited: 'visited'
        },
        TITLE_ELEMENT_NAME = 'H2';

    /**
     * @typedef {object} HTMLElement
     */

    /**

     * @class
     * @name slide.Layout
     *
     * Slide layout. Work with DOM, DOM events, etc. View for Slide class.
     *
     * @param {HTMLElement} element Slide node.
     */
    function Layout (element) {
        this.events = new EventEmitter();
        this._element = element;

        this._parent = null;
        this._parentElement = null;

        this.init();
    }

    extend(Layout.prototype, /** @lends slide.Layout.prototype */ {
        /**
         * @ignore
         * Init layout.
         */
        init: function () {
            var parentNode = this._element.parentNode;
            if (!parentNode) {
                this.setParentElement(parentNode);
            } else {
                this._parentElement = parentNode;
            }
        },

        setParent: function (parent) {
            if (this._parent != parent) {
                this._clearListeners();

                this._parent = parent;
                this._setupListeners();

                this.events.emit('parentchange', {
                    parent: parent
                });
            }
        },

        getParent: function () {
            return this._parent;
        },

        /**
         * @param {HTMLElement} parentElement
         */
        setParentElement: function (parentElement) {
            if (parentElement != this._parentElement) {
                this._parentElement = parentElement;
                parentElement.appendChild(this._element);

                this.events.emit('parentelementchange', {
                    parentElement: parentElement
                });
            }
        },

        /**
         * Return slide parent HTML element.
         *
         * @returns {HTMLElement} Layout parent element.
         */
        getParentElement: function () {
            return this._parentElement;
        },

        /**
         * Return slide HTML element.
         *
         * @returns {HTMLElement} Layout element.
         */
        getElement: function () {
            return this._element;
        },

        /**
         * Set slide title or create new H2 element into slide element.
         *
         * @param {string} title Slide title.
         */
        setTitle: function (title) {
            var titleElement = this._element.querySelector(TITLE_ELEMENT_NAME);

            if (titleElement) {
                titleElement.innerHTML = title;
            } else {
                titleElement = document.createElement(TITLE_ELEMENT_NAME);
                titleElement.innerHTML = title;
                this._element.insertBefore(titleElement, this._element.firstChild);
            }
        },

        /**
         * Return text content of H2 element.
         *
         * @returns {(string|null)} Title.
         */
        getTitle: function () {
            var titleElement = this._element.querySelector(TITLE_ELEMENT_NAME);
            return titleElement ? titleElement.textContent : null;
        },

        /**
         * Get data, defined in property of slide element.
         *
         * @param {string} name Data attr name.
         * @returns {object} Value of data attr.
         */
        getData: function (name) {
            var element = this._element;

            return element.dataset ?
                element.dataset[name] :
                element.getAttribute('data-' + name);
        },

        /**
         * Get inner content from slide element.
         *
         * @returns {string} Slide content.
         */
        getContent: function () {
            return this._element.innerHTML;
        },

        _setupListeners: function () {
            this._slideListeners = this._parent.events.group()
                .on('activate', this._onSlideActivate, this)
                .on('deactivate', this._onSlideDeactivate, this);

            this._element.addEventListener('click', bind(this._onSlideClick, this), false);
        },

        _clearListeners: function () {
            if (this._slideListeners) {
                this._slideListeners.offAll();
            }

            this._element.removeEventListener('click', bind(this._onSlideClick, this));
        },

        _onSlideActivate: function () {
            this._element.classList.add(CSS_CLASSES.active);
        },

        _onSlideDeactivate: function () {
            var elementClassList = this._element.classList;
            elementClassList.remove(CSS_CLASSES.active);
            elementClassList.add(CSS_CLASSES.visited);
        },

        _onSlideClick: function () {
            this.events.emit('click');
        }
    });

    provide(Layout);
});

/**
 * @file Layout factory for slides.
 */
modules.define('slide.layoutFactory', [
    'slide.Layout',
    'util.extend'
], function (provide, SlideLayout, extend) {

    /**
     * @name slide.layoutFactory
     * @function
     */
    function layoutFactory () {}

    extend(layoutFactory, /** @lends slide.layoutFactory */ {
        /**
         * @static
         * @function
         *
         * @param {object} [parameters]
         * @param {string} [parameters.content] Slide content.
         * @param {string} [parameters.contentType='slide'] Cover, slide, image.
         * @returns {slide.Layout}
         */
        createLayout: function (parameters) {
            parameters = parameters || {};

            var element = this._createElement(extend({
                content: '',
                contentType: 'slide'
            }, parameters));

            return new SlideLayout(element);
        },

        _createElement: function (options) {
            var element = document.createElement('section');
            element.innerHTML = options.content;
            element.classList.add(options.contentType);

            return element;
        }
    });

    provide(layoutFactory);
});

/**
 * @file Simple bind without currying.
 */
modules.define('util.bind', [], function (provide) {

    /**
     * @name util.bind
     * @static
     * @function
     * @param {function} fn Function.
     * @param {object} ctx Context.
     */
    var bind = typeof Function.prototype.bind == 'function' ?
        function (fn, ctx) {
            return fn.bind(ctx);
        } :
        function (fn, ctx) {
            return function () {
                return fn.apply(ctx, arguments);
            }
        };

    provide(bind);
});

modules.define('util.extend', function (provide) {

    /**
     * @name util.extend
     * @function
     * @static
     * @param {object} target
     * @param {object} source
     * @return {object} Extended target object.
     */
    function extend (target) {
        if (!target) {
            throw new Error('util.extend: Target not found');
        }
        for (var i = 1, l = arguments.length; i < l; i++) {
            var obj = arguments[i];
            for (var property in obj) {
                if (obj.hasOwnProperty(property)) {
                    target[property] = obj[property];
                }
            }
        }
        return target;
    }

    provide(extend);
});

modules.define("util.inherit", [
    "util.extend"
], function (provide, extend) {

    /**
     * Inherit function.
     * @name util.inherit
     * @function
     * @static
     * @param {function} ChildClass
     * @param {function} ParentClass
     * @param {object} override
     * @returns {object} Child class prototype.
     *
     * @example
     * function CrazySlide(content, options) {
     *      CrazySlide.super.constructor.call(this, content, options);
     *      …
     * }
     * inherit(CrazySlide, Slide, {
     *     _haveFun: function () {
     *         alert('fun');
     *     }
     * });
     */
    var inherit = function (ChildClass, ParentClass, override) {
        ChildClass.prototype = Object.create(ParentClass.prototype);
        ChildClass.prototype.constructor = ChildClass;
        ChildClass.super = ParentClass.prototype;
        ChildClass.super.constructor = ParentClass;

        if (override) {
            extend(ChildClass.prototype, override);
        }
        return ChildClass.prototype;
    };

    provide(inherit);
});
