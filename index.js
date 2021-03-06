'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const GoogleMapsAPI = require('googlemaps');
const request = require('request');
var moment = require('moment-timezone');

var publicConfig = {
  key: process.env.gmapskey,
  stagger_time: 100, // for elevationPath
  encode_polylines: false,
  secure: true, // use https
};
var gmAPI = new GoogleMapsAPI(publicConfig);

const restService = express();
restService.use(bodyParser.json());

var cityName = '';
var stateName = '';
var address = '';
var speech = '';

restService.post('/', function (req, res) {
  console.log('hook request');
  try {

    if (req.body) {
      var requestBody = req.body;
      if (requestBody.queryResult) {
        if (requestBody.queryResult.action == 'getLastCityQuake') {
          getLastCityQuake(requestBody, function (result) {
            console.log('result: ', speech);
            cityName = '';
            stateName = '';
            address = '';
            return res.json({
              fulfillment_text: speech,
              source: 'dhanush-quakey'
            });
          });
          console.log('result w/ getLastCityQuake: ', speech);
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
  var addC = false;
  if (requestBody.queryResult.parameters.cityName.length > 0) {
    cityName = requestBody.queryResult.parameters.cityName.indexOf('?') != -1 ? requestBody.queryResult.parameters.cityName.replace('?', '') : requestBody.queryResult.parameters.cityName;
    address = cityName;
    addC = true;
    console.log('cityName: ' + cityName);
  }
  if (requestBody.queryResult.parameters.stateName.length > 0) {
    stateName = requestBody.queryResult.parameters.stateName.indexOf(', ') != -1 ? requestBody.queryResult.parameters.stateName.replace(',', '') : requestBody.queryResult.parameters.stateName;
    stateName = stateName.indexOf('?') != -1 ? stateName.replace('?', '') : stateName;
    address += addC ? ', ' + stateName : stateName;
    console.log('stateName: ' + stateName);
  }
  var params = {
    'address': address,
    'components': 'components=country:US',
    'language': 'en',
    'region': 'us'
  };

  gmAPI.geocode(params, function (err, result) {
    console.log('err: ' + err);
    console.log('result: ' + result);
    var propValue;
    var errMsg = 'I am sorry. I was unable to get the coordinates for the city that you mentioned. Try adding the state name for better results.';
    for (var propName in result) {
      propValue = result[propName]
      console.log("->", propName, propValue);
    }
    if (err == null && result.status == 'OK') {
      if (result.results[0].geometry.location == undefined) {
        speech = errMsg;
        callback();
      }
      else {
        console.log('result.results[0]: ' + result.results[0]);
        console.log('result.results[0].geometry.location: ' + result.results[0].geometry.location);
        var lat = result.results[0].geometry.location.lat
        var long = result.results[0].geometry.location.lng;
        console.log('result.results[0].geometry.location.lat: ' + lat);
        console.log('result.results[0].geometry.location.lng: ' + long);
        USGSCall(lat, long, callback);
      }
    }
    else {
      speech = errMsg; //put this handling in api.ai later
      callback();
    }
  });
}

function USGSCall(lat, long, callback) {
  //ex: http://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=37.7799&longitude=121.9780&maxradius=180
  var radius;
  var num;
  if (cityName.length == 0 && stateName.length > 0) {
    radius = '&maxradiuskm=770'; //state search
    num = 770;
  }
  else {
    radius = '&maxradiuskm=80'; //city search
    num = 80;
  }
  var options = {
    url: 'http://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=' + lat + '&longitude=' + long + radius + '&orderby=time'
  };
  var noneFound = 'It appears there has been no recorded earthquake in ' + address + ' in the last 30 days in a ' + (num * 0.621371).toFixed(2) + ' mile radius. If you feel this is a mistake, try phrasing the question differently or try again later.';
  console.log("usgs url", options.url);
  request(options,
    function (err, res, body) {
      if (!err && res.statusCode == 200 && res.count != 0) {
        console.log('USGS res: ' + JSON.stringify(res));
        var info = JSON.parse(body);
        console.log('USGS features[0]: ' + JSON.stringify(info.features[0]));

        if (info.features[0] != undefined) {
          var mag = info.features[0].properties.mag;
          var place = info.features[0].properties.place;
          var location = place.substring(place.indexOf("m") + 1);
          var miles = (place.slice(0, place.indexOf("k")) * 0.621371192).toFixed(2); //convert km to miles and round
          var unixTimeMS = info.features[0].properties.time;
          console.log('original time given from USGS: ' + unixTimeMS);

          var params = {
            location: lat + ',' + long,
            timestamp: 1234567890
          };
          gmAPI.timezone(params, function (err, result) {
            if (err == null && result.status == 'OK') {
              var hoursOff = (result.dstOffset + result.rawOffset) / 3600; //from GMT
              var tzID = result.timeZoneId;
              var mTime = moment.tz(unixTimeMS, tzID);
              var date = mTime.format('MMMM Do YYYY');
              var time = ' at ' + mTime.format('h:mm:ss a') + ' local time';
              console.log(date + time);
              var label = miles >= 2 ? 'miles' : 'mile';
              speech = 'The last earthquake in ' + address + ' was a ' + mag + ' magnitude ' + miles + ' ' + label + location + ' on ' + date + time;
              console.log('USGS speech: ' + speech);
              callback();
            }
          });
        }
        else {
          console.log('USGS err from if statement: ' + JSON.stringify(err));
          speech = noneFound;
          callback();
        }
      }
      else {
        console.log('USGS err from else statement: ' + JSON.stringify(err));
        speech = noneFound;
        callback();
      }
    });
}

//for reference: http://stackoverflow.com/questions/37960857/how-to-show-personalized-welcome-message-in-facebook-messenger?answertab=active#tab-top
function createGreetingApi(data) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: 'EAAChvQrWC7EBAMfU5EHN9ZBS9fHvtigQDbfh3uyh20tzj1ZCx5MYYWtEUuTMW8XbegDZBjw3OtfgsMf00zYlWf8mrCZCYAgFRaUMG88NYeVe5VM5vCJiCaTBoG9F9NGMeXo4VF29p501FmnSvhcYosY9l3r5QBvyzbVPE14PaDl82ySgSDRQ' },
    method: 'POST',
    json: data

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Greeting set successfully!");
    } else {
      console.error("Failed calling Thread Reference API", response.statusCode, response.statusMessage, body.error);
    }
  });
}

function setGreetingText() {
  var greetingData = {
    setting_type: "greeting",
    greeting: {
      text: "Hi {{user_first_name}}, welcome! You can ask when the last earthquake was in any US city."
    }
  };
  createGreetingApi(greetingData);
}

restService.listen((process.env.PORT || 8000), function () {
  console.log('Server listening');
  setGreetingText();
});
