// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Computed arrivals as you did in step 4.2
  const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    );

  // Update each station..
  return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        // TODO departures
        station.departures = departures.get(id) ?? 0;
        station.total = station.arrivals + station.departures;
        return station;
    });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}


// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiY3JlcHVzaWRpZW0iLCJhIjoiY21hcTU2eGU3MDV2NDJrcG1qaWFyMXJreiJ9.Pza5ml0vm7DGQkyq_vzXFQ';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
//   style: 'mapbox://styles/mapbox/streets-v12', // Default map style
  style: 'mapbox://styles/mapbox/navigation-night-v1', // Map style
  center: [-71.0756790, 42.3616692], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {
    map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });

    

    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: {
        'line-color': 'green',
        'line-width': 5,
        'line-opacity': 0.6,
        },
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: {
        'line-color': 'green',
        'line-width': 5,
        'line-opacity': 0.6,
        },
    });

    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

        // Await JSON fetch
        jsonData = await d3.json(jsonurl);

        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    } 
    catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }

    let trips = await d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        },
    );

    const stations = computeStationTraffic(jsonData.data.stations, trips);
    console.log('Stations length:', stations.length); // Log to verify structure

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.total)])
        .range([0, 25]);


    const svg = d3.select('#map').select('svg');
    // Append circles to the SVG for each station
    const circles = svg
        .selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(d.total)) // Radius of the circle by the scale
        .attr('fill', 'steelblue') // Circle fill color
        .attr('stroke', 'white') // Circle border color
        .each(function (d) {
            // Add <title> for browser tooltips
            d3.select(this)
            .append('title')
            .text(
                `${d.total} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
            );
        });

    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
            .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    updatePositions();
    // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends

    const timeSlider = document.getElementById('time-slider');
    // const selectedTime = document.getElementById('#selected-time');
    // const anyTimeLabel = document.getElementById('#any-time');

    function updateScatterPlot(timeFilter) {
        // Get only the trips that match the selected time filter
        const filteredTrips = filterTripsbyTime(trips, timeFilter);

        // Recompute station traffic based on the filtered trips
        const filteredStations = computeStationTraffic(stations, filteredTrips);

        // Update the scatterplot by adjusting the radius of circles
        circles
            .data(filteredStations)
            .join('circle') // Ensure the data is bound correctly
            .attr('r', (d) => radiusScale(d.total)); // Update circle sizes
    }


    function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value); // Get slider value
        // Trigger filtering logic which will be implemented in the next step
        updateScatterPlot(timeFilter);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

});

