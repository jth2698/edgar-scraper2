const axios = require('axios');

// A simple async / await axios call to a page to be implemented in connection with a scraper (below)
const fetchSECPage = async (url) => {

    try {
        const result = await axios.get(url).catch(async error => { console.log(error) });
        if (result) { return result.data };

    } catch (error) { throw error }
}

module.exports = fetchSECPage;