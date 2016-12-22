'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const GoogleMapsAPI = require('googlemaps');
const request = require('request');

var publicConfig = {
    key: 'AIzaSyBp3rRwTttJWE-R-umfiAqcvGvP6_TNz00',
    stagger_time:       100, // for elevationPath
    encode_polylines:   false,
    secure:             true, // use https
};
var gmAPI = new GoogleMapsAPI(publicConfig);

const restService = express();
restService.use(bodyParser.json());

var cityName;
var speech = '';

restService.post('/hook', function (req, res) {
  console.log('hook request');
  try {

      if (req.body) {
          var requestBody = req.body;
          if (requestBody.result) {
            if (requestBody.result.action == 'getLastCityQuake') {
              getLastCityQuake(requestBody,function(result) {
                console.log('result: ', speech);
                return res.json({
                  speech: speech,
                  displayText: speech,
                  source: 'dhanush-quakey'
                });
              });
              console.log('result w/ getLastCityQuake: ', speech);
                // speech = 'speech: ' + requestBody.result.fulfillment.speech + ' | NODE SERVER WORKS HAHAHA | ';
            }
          }
      }
  }
  catch (err) {
    console.error('Cannot process request', err);
    return res.status(400).json({
        status: {
            code: 400,
            errorType: err.message
        }
    });
  }
});

function getLastCityQuake(requestBody, callback) {
  console.log('requestBody: ' + JSON.stringify(requestBody));
  cityName = requestBody.result.parameters.cityName;
  console.log('cityName: ' + cityName);
  var params = {
    'address': cityName,
    'components': 'components=country:US',
    'language':   'en',
    'region':     'us'
  };

  gmAPI.geocode(params, function(err, result) {
    console.log('err: '+err);
    console.log('result: '+result);
    var propValue;
    for(var propName in result) {
        propValue = result[propName]
        console.log(propName,propValue);
    }
    if (result.results[0].geometry.location == undefined) {
      return 'I am sorry. I was unable to understand the city that you mentioned'; //put this handling in api.ai later
    }
    else{
      console.log('result.results[0]: ' + result.results[0]);
      console.log('result.results[0].geometry.location: ' + result.results[0].geometry.location);
      var lat = result.results[0].geometry.location.lat
      var long = result.results[0].geometry.location.lng;
      console.log('result.results[0].geometry.location.lat: ' + lat);
      console.log('result.results[0].geometry.location.lng: ' + long);
      USGSCall(lat, long, callback);
      // console.log('USGSResult: ' + USGSResult);
      // return USGSResult;
    }
  });
}

function USGSCall(lat, long, callback) {
  //ex: http://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=37.7799&longitude=121.9780&maxradius=180
  var options = {
    url: 'http://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=' + lat + '&longitude=' + long + '&maxradiuskm=100&orderby=time',
  };
  var ret = 'It appears there has been no recorded earthquake in' + cityName + ' in the last 30 days.';

  request(options,
    function (err, res, body) {
      if (!err && res.statusCode == 200 && res.count != 0) {
        console.log('USGS res: ' + JSON.stringify(res));
        // console.log('USGS body: ' + JSON.stringify(body));
        var info = JSON.parse(body);
        console.log('USGS features[0]: ' + info.features[0]);
        var mag = info.features[0].properties.mag;
        var place = info.features[0].properties.place;
        var location = place.slice(' ');
        var miles = place.slice(0, place.indexOf("km")) * 0.621371192; //convert km to miles
        var date = new Date(info.features[0].properties.time);
        speech = 'The last earthquake in ' + cityName + ' was a ' + mag + ' ' + miles + ' ' + location;
        console.log('USGS speech: ' + speech);
        callback();
      }
      else {
        console.log('USGS err: ' + JSON.stringify(err));
        speech = ret;
      }
    });
  }

restService.listen((process.env.PORT || 8000), function () {
  console.log('Server listening');
});
