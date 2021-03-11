const db = require('../models');

module.exports = {
    create: function (contractObj) {
        db.Contract
            .insert(contractObj)
    }
}