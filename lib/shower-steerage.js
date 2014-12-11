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
        this._onSlideActivate(this._shower.player.getCurrentSlide());
      }
    },

    destroy: function () {
      this._clearListeners();
      this._shower = null;
    },

    _setupListeners: function () {
      var shower = this._shower;

      this._showerListeners = shower.events.group()
        .on('destroy', this.destroy, this);

      this._playerListeners = shower.player.events.group()
        .on('activate', function (e) {
          this._onSlideActivate(e.get('slide'))
        }, this)
        .on('next', this._onNext, this)
        .on('prev', this._onPrev, this);
    },

    _clearListeners: function () {
      this._showerListeners.offAll();
      this._showerListeners = null;

      this._playerListeners.offAll();
      this._playerListeners = null;
    },

    _getCallbackFn: function (name, slide) {
      slide = slide || this._shower.player.getCurrentSlide();
      var slideOptions = slide && slide.options || {};
      var steerageOptions = slideOptions.steerage || {};
      return typeof steerageOptions[name] == 'function' ? steerageOptions[name] : function () {
        return false;
      };
    },

    _go: function (direction, e) {
      var fn = this._getCallbackFn(direction);
      if (this._shower.container.isSlideMode()) {
        if (fn.call(this)) {
          e.preventDefault();
          this.events.emit(direction);
        }
      }
    },

    _onNext: function (e) {
      this._go('next', e);
    },

    _onPrev: function (e) {
      this._go('prev', e);
    },

    _onSlideActivate: function (slide) {
      var fn = this._getCallbackFn('activate', slide);
      if (this._shower.container.isSlideMode()) {
        fn.call(this);
      }
    }
  });

  provide(Steerage);
});

modules.require(['shower'], function (shower) {
  shower.plugins.add('shower-steerage');
});
