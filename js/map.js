modules.require(['shower'], function (shower) {

  var initFn = 'steerageExampleInit' + Math.round(1e6 * Math.random());
  window[initFn] = function () {
    shower.getSlidesArray()
      .filter(function (s) {
        return !!s.getLayout().getData('map');
      })
      .forEach(function (s) {
        new Map(s);
      });
  };


  function Map(slide) {
    this._init(slide);
  }

  Map.prototype._init = function(slide) {

    var layout = slide.getLayout();
    var el = layout.getElement();
    var mapContainer = document.createElement('div');
    mapContainer.className = 'map';
    el.appendChild(mapContainer);

    var optionsContainer = el.querySelector('script[type="application/json"]');
    if (!optionsContainer) {
      return;
    }

    var options = JSON.parse(optionsContainer.innerText);

    var markers = options.markers.map(function (m) {
      return new google.maps.Marker(m);
    });

    var bounds = new google.maps.LatLngBounds();
    markers.forEach(function (m) {
      bounds.extend(m.getPosition());
    });

    var map = new google.maps.Map(mapContainer, {
      center: bounds.getCenter(),
      zoom: 12
    });

    markers.forEach(function (m) {
      m.setMap(map);
    });

    this._markers = markers;
    this._map = map;

    slide.options.steerage = {
      activate: this._activate.bind(this),
      next: this._next.bind(this),
      prev: this._prev.bind(this)
    };

    shower.plugins.get('shower-steerage').update(slide);
  };

  Map.prototype._activate = function () {
    if (this._activeMarkerIndex) {
      if (this._activeMarkerIndex < 0) {
        this._activeMarkerIndex = 0;
      }
      if (this._activeMarkerIndex >= this._markers.length) {
        this._activeMarkerIndex = this._markers.length - 1;
      }
    } else {
      this._activeMarkerIndex = 0;
    }
    this.showMarker(this._activeMarkerIndex);
  };

  Map.prototype._next = function () {
    var result = false;
    this._activeMarkerIndex++;
    if (this._activeMarkerIndex >= 0 && this._activeMarkerIndex < this._markers.length) {
      this.showMarker(this._activeMarkerIndex);
      result = true;
    }
    return result;
  };

  Map.prototype._prev = function () {
    var result = false;
    this._activeMarkerIndex--;
    if (this._activeMarkerIndex >= 0 && this._activeMarkerIndex < this._markers.length) {
      this.showMarker(this._activeMarkerIndex);
      result = true;
    }
    return result;
  };

  Map.prototype.showMarker = function (index) {
    var marker = this._markers[index];
    var map = this._map;
    map.panTo(marker.getPosition());
  };



  function loadScript() {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://maps.googleapis.com/maps/api/js?sensor=false&callback=' + initFn;
    document.body.appendChild(script);
  }
  
  shower.events.on('ready', function () {
    loadScript();
  });

});
