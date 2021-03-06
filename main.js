const fs = require('fs');
const path = require('path');

const getMasterIndexFiles = require('./utils/crawler-utils/getMasterIndexFiles');
const scrapeClauses = require('./scrapers/pClauseScraper')

const years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020];
const dataDir = path.resolve('./data');

const main = async () => {

    try {
        for (const year of years) {
            if (!fs.existsSync(`${dataDir}/${year}`)) {
                await getMasterIndexFiles(year);
                await scrapeClauses(year);
            }
        }
    }

    catch (error) { throw error }
}

module.exports = main;