const getURLQueue = async (urls, scraperFunction, delay, batchDelay) => {

    try {

        let timeoutIterator = 100;
        let urlPromises = [];

        // We loop through the urls to create each promise (passed to Promise.all in the main function)
        urls.forEach((url, index) => {
            // This iterates the timeout on each loop. Fo batching purposes, the timeout is the iterator + the batchDelay if index is a multiple of 100; otherwise it is the iterator + 100ms
            if (index !== 0 && index % 100 === 0) { timeoutIterator = timeoutIterator + batchDelay }
            else { timeoutIterator = timeoutIterator + delay };
            urlPromises.push(
                new Promise(async resolve => {
                    // First, the promise will wait for setTimeout to run before resolving
                    await new Promise(resolve => { setTimeout(resolve, timeoutIterator) });
                    // Then, we pass the resolve of a second Promise calling indexScraper to a variable to resolve with the top-level promise.
                    let result = await new Promise(resolve => { resolve(scraperFunction(url, index + 1)) });
                    resolve(result);
                }));

        });
        // Finally, when the forEach loop completes, return the array of promises to be passed to Promise.all in scraper function
        return urlPromises;

    } catch (error) { throw error }
}

module.exports = getURLQueue;