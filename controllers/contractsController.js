const db = require('../models');

module.exports = {
    create: function (contractObj) {
        db.Contract
            .insert(contractObj)
    },
    findByYear: function (req, res) {
        db.ContractMeta
            .find()
    }
}