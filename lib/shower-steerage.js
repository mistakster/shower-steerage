modules.define('shower-steerage', [
  'event.Emitter',
  'util.extend',
  'util.bind'
], function (provide, EventEmitter, extend, bind) {

  /**
   * @class
   * @name plugin.Steerage
   * @param {Shower} shower
   * @param {Object} [options] Plugin options.
   * @param {String} [options.selector = '.next']
   * @constructor
   */
  function Steerage(shower, options) {
    options = options || {};
    this.events = new EventEmitter();

    this._shower = shower;
  }

  extend(Steerage.prototype, /** @lends plugin.Steerage.prototype */{

    init: function () {
      this._setupListeners();
      if (this._shower.player.getCurrentSlideIndex() != -1) {
        this._onSlideActivate();
      }
    },

    destroy: function () {
      this._clearListeners();
      this._shower = null;
    },

    next: function () {
      this.events.emit('next');
      return this;
    },

    prev: function () {
      this.events.emit('prev');
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

  provide(Steerage);
});

//modules.require(['shower'], function (shower) {
//  shower.plugins.add('shower-steerage');
//});