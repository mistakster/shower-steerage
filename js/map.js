modules.require(['shower'], function (shower) {

  var initFn = 'steerageExampleInit' + Math.round(1e6 * Math.random());
  window[initFn] = function () {
    initSlides();
  };


  var maps = {};

  function initSlides() {

    shower.getSlidesArray()
      .filter(function (s) {
        return !!s.getLayout().getData('map');
      })
      .forEach(function (s) {
        maps[s.getId()] = new Map(s);
      });

    shower.player.events.on('activate', function (e) {
      var slide = e.get('slide');
      var map = maps[slide.getId()];
      if (map) {
        map.first();
      }
    });

  }


  function Map(slide) {
    this._slide = slide;
    this.init(slide);
  }

  Map.prototype.init = function(slide) {

    var layout = slide.getLayout();
    var el = layout.getElement();
    var mapContainer = document.createElement('div');
    mapContainer.className = 'map';
    el.appendChild(mapContainer);

    var optionsContainer = el.querySelector('script[type="application/json"]');
    if (optionsContainer) {
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
        zoom: 15
      });

      markers.forEach(function (m) {
        m.setMap(map);
      });

      this._markers = markers;
      this._map = map;

      slide.options.steerage = {
        items: markers
      };
    }
  };

  Map.prototype.first = function () {
    var marker = this._markers[0];
    this._map.panTo(marker.getPosition());
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
