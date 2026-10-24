// Where the mock shoppers' cities are. A live widget geolocates the shopper's
// IP at the edge; the demo personas only name a city, so this stands in.

export const CITY_COORDS: Record<string, [lat: number, lon: number]> = {
  "Asheville, NC": [35.6, -82.55],
  "Atlanta, GA": [33.75, -84.39],
  "Austin, TX": [30.27, -97.74],
  "Boston, MA": [42.36, -71.06],
  "Brooklyn, NY": [40.68, -73.94],
  "Burlington, VT": [44.48, -73.21],
  "Charleston, SC": [32.78, -79.93],
  "Chicago, IL": [41.88, -87.63],
  "Denver, CO": [39.74, -104.99],
  "Houston, TX": [29.76, -95.37],
  "Los Angeles, CA": [34.05, -118.24],
  "Madison, WI": [43.07, -89.4],
  "Miami, FL": [25.76, -80.19],
  "Minneapolis, MN": [44.98, -93.27],
  "Philadelphia, PA": [39.95, -75.17],
  "Portland, OR": [45.52, -122.68],
  "Salt Lake City, UT": [40.76, -111.89],
  "San Diego, CA": [32.72, -117.16],
  "San Francisco, CA": [37.77, -122.42],
  "Santa Cruz, CA": [36.97, -122.03],
  "Seattle, WA": [47.61, -122.33],
};
