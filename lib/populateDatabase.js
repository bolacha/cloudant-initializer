var _               = require('lodash');
var Q               = require('q');
var fs              = require('fs');
var path            = require('path');
var equal           = require('deep-equal');
var Cloudant        = require('cloudant');

module.exports = Populate;

function Populate(database_url, database_name, database_directory) {
	this.database_url = database_url;
	this.database_name = database_name;
	this.database_directory = (!database_directory)? "../_database" : database_directory;

	this.typesBeUpdated    = [];
	this.parsed_files   = {};
}



Populate.prototype.populate = function() {
	var deferred = Q.defer();
	var self = this;

	console.log("Populate DB");

	// Syncronous Method that will lock the Node
	self.populateLocalVariables()
		.then(function (body) {
			return (this.parsed_files = body) && Q.all(this.getLocalTypes().map(this.createViewForType, this))
		})
		.then(function(results){
			return self.getVersionsFromDatabase();
		})
		.then(function (version) {
			return self.updateVersion(version);
		})
		.then(function (typesToBeUpdated) {
			return Q.all(typesToBeUpdated.map(self.pushDataToDatabase,self));
		})
		.then(function (body) {
			console.log(body)
		});


	return deferred.promise;
};

Populate.prototype.getLocalTypes = function() {
	return this.parsed_files.map(function(file){
		console.log(file);
		return file.type;
	});
};

Populate.prototype.getLocalDataByType = function(type) {
	((process.env.NODE_ENV || 'development') == 'development')? console.log('getLocalDataByType('+type+')'): '';
	var type_data = {};
	
	return this.parsed_files.forEach(function (file) {
		if(file.type == type) {
			console.log(file.type);
			return type_data = file.data;

			console.log(file.data);
		}
	});
	

};

Populate.prototype.getCompareByType = function(type) {

	return this.parsed_files.forEach(function (file) {
		console.log(file.type);
		return file.compare_field;
	});
};


Populate.prototype.getLocalVersions = function() {
	var types = {};
	this.parsed_files.forEach(function(file){
		types[file.type] = file.version;
	});

	return types;
};

Populate.prototype.getFiles = function() {
	var self = this,
		deferred = Q.defer();
	fs.readdirSync(path.join(__dirname, this.database_directory),function(err, files) {
		if(!err) {
			deferred.resolve(files);
			return;
		}
	});

	return deferred.promise;
}


Populate.prototype.populateLocalVariables = function() {
	var self = this,
		deferred = Q.defer();

	Q.all(fs.readdirSync(path.join(__dirname, this.database_directory))
		.filter(function(file) { return file.substr(-5) === '.json'; })
		.map(function(file){
			var file_deferred = Q.defer();

			console.log(file);

			file_deferred.resolve(require(this.database_directory + "/" + file));

			return file_deferred.promise;
		},this))
			.then(function (body) {
				self.parsed_files = body;
				deferred.resolve(body);
			});

	return deferred.promise;
};

Populate.prototype.getVersionsFromDatabase = function() {
	var self     = this,
		deferred = Q.defer();

	console.log("Compare Versions");

	Cloudant(self.database_url).use(self.database_name).get(self.database_name+'_version', function(err, version) {
		// Something went wrong with couch
		if (err && err.statusCode != 404) {
			deferred.reject('ERROR_UPDATING_DB_VERSION');
			return;
		}

		deferred.resolve(version);
	});

	return deferred.promise;
};

Populate.prototype.updateVersion = function(version) {
	var self = this,
		deferred = Q.defer();

	if(!version) console.log("Empty Version");

	if(!version) {

		self.updateVersions(self.getLocalVersions()).then(function(body){
			deferred.resolve(self.getLocalVersions());
		});

		return deferred.promise;
	}

	var oldVersion = _.cloneDeep(version);
	var localVersion = self.getLocalVersions();

	var typesBeUpdatedLocal = [];

	for(var key in localVersion) {
		//localVersion[key] = localVersion[key] * 10;
		if(!version[key] || localVersion[key] > version[key])
 			version[key] = localVersion[key];

		if(!oldVersion[key] || localVersion[key] > oldVersion[key]) {
			console.log(key);
			typesBeUpdatedLocal.push(key);

		} else if(localVersion[key] < oldVersion[key]){
			console.log('DB_VERSION_DOWNGRADE_DENIED');
			console.log('You are trying to get '+key+' from version '+oldVersion[key]+' to version '+ localVersion[key]+', and downgrading a db version is not allowed. Choose the same version to change nothing or a version above is something has changed.');
		}
	}

	if(!_.isEqual(oldVersion, version)){
		self.updateVersions(version).then(function () {
			deferred.resolve(typesBeUpdatedLocal);
		});
	} else {
		deferred.resolve([]);
	}

	return deferred.promise;

}

Populate.prototype.updateVersions = function(version) {
	var self = this,
		deferred = Q.defer();

	Cloudant(self.database_url).use(self.database_name).insert(version, self.database_name+'_version', function(err, body){
		if(err) {
			console.log('DIDNT_UPDATE_DB_VERSION');
			console.log(err);
			deferred.resolve(400);
			return;
		}

		console.log('DB_VERSION_UPDATED');
		deferred.resolve(200);
	});

	return deferred.promise;
};

Populate.prototype.createViewForType = function (type) {
	var self        = this,
		deferred    = Q.defer();

	var design_name = "_design/"+self.database_name+"_"+type;
	
	Cloudant(self.database_url).use(self.database_name).get(design_name,function(err){
		if(err && err.statusCode == 404) {

			var design_document = {
					language: 'javascript',
					views: {
						by_type : {
							map: function(doc) {
								if(doc.type === 'site') {
									emit(doc._id, {
										_id: doc._id
									});
								}
							}
						}
					}
				};

			Cloudant(self.database_url).use(self.database_name)
				.insert(design_document, design_name, function(err) {
					if(err && err.statusCode === 409) {
						deferred.reject(409);
					} else {
						deferred.resolve(true);
					}
				});

			return;
		} else if(err) {
			deferred.reject(err);
			return;
		} else {
			deferred.resolve(200);
		}
	});

	return deferred.promise;
};


Populate.prototype.pushDataToDatabase = function(type) {

	var self = this,
		deferred = Q.defer();

	console.log('Bulk Data for : '+type);

	var toCompare = self.getCompareByType(type);

	self.existingDocuments(type)
		.then(function(body){


			console.log(this.parsed_files);

			console.log('Error HEHE');

			// var add = self.addNewDocuments(localData, body);
			//
			// console.log(add);
			// var remove = removeOldSites(sites, body);
			// var update = updateExistingSites(sites, body);
			//
			// var bulk = { docs: add.concat(remove, update) };
			// if(bulk.docs.length === 0) return;
			//
			// db.bulk(bulk, function(err, success){
			// 	if(err) {
			// 		console.log('COULDNT_UPDATE_SITES');
			// 		console.log(err);
			// 		return;
			// 	}
			//
			// 	console.log('SITES_UPDATED');
			// 	console.log(success);
			// });

			deferred.resolve(body);
		})
		.catch(function(err){
			console.log('CANT_ADD_SITES');
			console.log(err);
			console.log(err.stack);
		});

	return deferred.promise;
};

Populate.prototype.existingDocuments = function(type) {
	var self = this,
		deferred = Q.defer();

	Cloudant(self.database_url).use(self.database_name).view(self.database_name+'_'+type, 'by_type', {include_docs: true}, function(err, body){
		if(err) { deferred.reject(err); return; }

		if(body.rows.constructor === Array && body.rows.length > 0){
			body = body.rows.map(function (row) {
				return row.doc;
			});

			deferred.resolve(body);
		} else {
			deferred.resolve([]);
		}
	});

	return deferred.promise;
};

Populate.prototype.addNewDocuments = function(type, old) {
	var self = this;

	var current = self.getLocalDataByType(type);
	var toCompare = self.getCompareByType(type);

	console.log('\n\n\n');
	console.log('BEGIN');
	console.log(current);
	console.log(toCompare);
	console.log('END');
	console.log('\n\n\n');


	var currentCod = self.documentsByCompare(current, toCompare);
	var oldCod     = self.documentsByCompare(old, toCompare);

	var newSites = [];
	currentCod.forEach(function(e, index){
		if(oldCod.indexOf(e) === -1)
			newSites.push(current[index]);
	});

	// Return an empty array if there are no site
	if (newSites.length === 0) return [];

	// Add a unique document id for each
	newSites = newSites.map(function(e){
		e._id = uuid.v4();
		return e;
	});

	return newSites;
};

/**
 * Old site to be removed
 * @param  {Array} current The new site being inserted
 * @param  {Array} old     The site on the db
 * @return {Array}         Array of deleted site to be inserted
 */
Populate.prototype.removeOldSites = function(current, old) {
	var currentCod = sitesByCod(current);
	var oldCod     = sitesByCod(old);

	var oldSites = [];
	oldCod.forEach(function(e, index){
		if(currentCod.indexOf(e) === -1)
			oldSites.push(old[index]);
	});

	// Return if no site will be deleted
	if (oldSites.length === 0) return [];

	// Mark for deletion
	oldSites = oldSites.map(function(e){
		e.deleted = true;
		return e;
	});

	return oldSites;
};

/**
 * Update the existing site, if they are different
 * @param  {Object} current New list of site
 * @param  {Object} old     Sites on the db
 * @return {Array}          Array of updated site objs to be inserted
 */
Populate.prototype.updateExistingDocuments = function(current, old) {
	var currentCod = sitesByCod(current);
	var oldCod     = sitesByCod(old);

	var updatedSites = [];
	currentCod.forEach(function(e, currentIndex){
		var oldIndex = oldCod.indexOf(e);
		if(oldIndex === -1) return;

		var oldSite     = old[oldIndex];
		var currentSite = current[currentIndex];

		// Remove _id and _rev for comparison to work
		var _id  = oldSite._id;
		var _rev = oldSite._rev;
		delete oldSite._id;
		delete oldSite._rev;

		// It's the new, updated version
		if(!_.isEqual(oldSite, currentSite)) {
			currentSite._id  = _id;
			currentSite._rev = _rev;

			updatedSites.push(currentSite);
		}
	});

	return updatedSites;
};

/**
 * Creates an array with all site cods
 * @param  {Array} sites Array of site
 * @return {Array}       Array of site cods only
 */
Populate.prototype.documentsByCompare = function(documents, compare) {
	return documents.map(function(e){ return e[compare]; });
}


