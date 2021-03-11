const Promise = require('bluebird');

// Special use case in pClauseScraper. See notes to pClauseScraper.
const bluebird = async (urls, delay, scraperFunction) => {
    try {
        // Executes on an array async
        await Promise.mapSeries(urls, async (url, index, length) => {
            console.log(`processing url ${index + 1} of ${length}: ${url}`);
            await Promise.delay(delay);
            await scraperFunction(url);
        }).then(() => { return })
    } catch (error) { throw error }
}

module.exports = bluebird;