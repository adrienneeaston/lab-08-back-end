'use strict'

// Load environment variables
require('dotenv').config();
//Load express to do the heavey lifting -- Application dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors'); //Cross Origin Resource Sharing
const pg = require('pg');
//Application setup
const app = express();
app.use(cors()); //tell express to use cors
const PORT = process.env.PORT || 3000;
//Connect to DATABASE
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.log(err));
//Incoming API routes
app.get('/testing', (request, response) => {
  response.send('<h1>HELLO WORLD..</h1>')
});
app.get('/location', searchToLatLong)
app.get('/weather', getWeather);
app.get('/events', getEvent);
//server listening for requests
app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));
//Helper Functions
//refactor for SQL storage
// 1. Need to check DB to see if location exists
// 2. if it exists => get location from DB
// 3. return infor to front
// 4. if does not
// 5. get location from API
//6. run data through constructor
//7. save to DB
//8. add newly added location id to location object
//9. return location to front
function searchToLatLong(request, response) {
  let query = request.query.data;
  let sql = `SELECT * FROM locations WHERE search_query=$1;`;
  let values = [query];
  client.query(sql, values)
    .then(result => {
      console.log('result from DB', result.rowCount[0])
      if (result.rowCount > 0) {
        response.send(result.rows[0]);
      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;
        superagent.get(url)
          .then(result => {
            if (!result.body.results.length) { throw 'NO DATA'; }
            else {
              let location = new Location(query, result.body.results[0])
              let newSQL = `INSERT INTO locations (search_query, formatted_address, latitude, longitude) VALUES ($1, $2, $3, $4) RETURN ID;`;
              let newValues = Object.values(location);
              client.query(newSQL, newValues)
                .then(data => {
                  location.id = data.rows[0].id;
                  response.send(location);
                });
            }
          })
          .catch(err => handleError(err, response));
      }
    })
}
// Constructor for location data
function Location(query, response) {
  this.search_query = query;
  this.formatted_query = response.body.results[0].formatted_address;
  this.latitude = response.body.results[0].geometry.location.lat;
  this.longitude = response.body.results[0].geometry.location.lng;
}
function getWeather(request, response) {
  let query = request.query.data.id;
  let sql = `SELECT * FROM weathers WHERE search_query=$1;`;
  let values = [query];
  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows);
      } else {
        const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
        return superagent.get(url)
          .then(weatherResults => {
            if (!weatherResults.body.daily.data.length) { throw 'NO DATA'; }
            else {
              const weatherSummaries = weatherResults.body.daily.data.map(day => {
                let summary = new Weather(day);
                summary.id = query;
                let newSQL = `INSERT INTO weathers (forecast, time, location_id) VALUES($1, $2, $3);`;
                let newValues = Object.values(summary);
                client.query(newSQL, newValues);
                return summary;
              });
              response.send(weatherSummaries);
            }
          })
          .catch(err => handleError(err, response));
      }
    })
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}
function getEvent(request, response) {
  let query = request.query.data.id;
  let sql = `SELECT * FROM events WHERE search_query=$1;`;
  let values = [query];
  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows);
      }
      else {
        const url = `https://www.eventbriteapi.com/v3/events/search/?token=${process.env.EVENTBRITE_API_KEY}&location.latitude=${request.query.data.latitude}&location.longitude=${request.query.data.longitude}`;
        return superagent.get(url)
          .then(eventResults => {
            if (!eventResults.body.events.data.length) { throw 'NO DATA'; }
            else {
              const eventSummaries = eventResults.body.events.data.map(events => {
                let summary = new Event(events);
                summary.id = query;
                let newSQL = `INSERT INTO events (link, name, host, event_date, location_id) VALUES($1, $2, $3, $4, $5);`;
                let newValues = Object.values(summary);
                client.query(newSQL, newValues);
                return summary;
              });

              response.send(eventSummaries);
            }
          })
          .catch(err => handleError(err, response));
      }
    })
}

function Event(event) {
  this.link = event.url;
  this.name = event.name.text;
  //below is a placeholder, it's a number not a name, but i didn't see any names so we can come back to this later. 
  this.host = event.organization_id;
  this.event_date = event.start.local;
}
//error handler
function handleError(err, response) {
  console.log(err);
  if (response) response.status(500).send('Sorry something went wrong');
}
  //   //give url for Eventbrite API
  //   const url = `https://www.eventbriteapi.com/v3/events/search/?token=${process.env.EVENTBRITE_API_KEY}&location.latitude=${request.query.data.latitude}&location.longitude=${request.query.data.longitude}`;
  //   superagent.get(url)
  //     .then(result => {
  //       const eventSummaries = result.body.events.map(events => new Event(events));
  //       console.log(eventSummaries)
  //       response.send(eventSummaries);
  //     })
  //     .catch(err => handleError(err, response));
  // }