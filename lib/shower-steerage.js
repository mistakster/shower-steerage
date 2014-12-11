modules.define('shower-steerage', [
  'event.Emitter',
  'util.extend',
  'util.bind'
], function (provide, EventEmitter, extend, bind) {

  /**
   * @class
   * @name plugin.Steerage
   * @param {Shower} shower
   * @constructor
   */
  function Steerage(shower) {
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
      this._currentIndex++;
      this._go();

      this.events.emit('next');
      return this;
    },

    prev: function () {
      this._currentIndex--;
      this._go();

      this.events.emit('prev');
      return this;
    },

    getLength: function () {
      this._items = this._getItems();
      return this._items.length;
    },

    _setupListeners: function () {
      var shower = this._shower;

      this._showerListeners = shower.events.group()
        .on('destroy', this.destroy, this);

      this._playerListeners = shower.player.events.group()
        .on('activate', this._onSlideActivate, this)
        .on('next', this._onNext, this)
        .on('prev', this._onPrev, this);
    },

    _clearListeners: function () {
      this._showerListeners.offAll();
      this._showerListeners = null;

      this._playerListeners.offAll();
      this._playerListeners = null;
    },

    _getItems: function () {
      var slide = this._shower.player.getCurrentSlide();
      var pluginOptions = slide.options.steerage || {};
      return pluginOptions.items || [];
    },

    _onNext: function (e) {
      var count = this._items.length;
      if (this._shower.container.isSlideMode()) {
        if (count && this._currentIndex < count) {
          e.preventDefault();
          this.next();
        }
      }
    },

    _onPrev: function (e) {
      var count = this._items.length;
      if (this._shower.container.isSlideMode()) {
        if (count && this._currentIndex > 0 && this._currentIndex < count) {
          e.preventDefault();
          this.prev();
        }
      }
    },

    _go: function () {
      var index = this._currentIndex;
      if (index >= 0 && index < this._items.length) {
        this.events.emit('activate', {index: index});
      }
    },

    _onSlideActivate: function () {
      this._items = this._getItems();
      this._currentIndex = 0;
    }
  });

  provide(Steerage);
});

modules.require(['shower'], function (shower) {
  shower.plugins.add('shower-steerage');
});
