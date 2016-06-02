var Cloudant        = require('cloudant');
var fs              = require('fs');
var path            = require('path');
var equal           = require('deep-equal');
var cfenv 			= require('cfenv');
var Q     			= require('q');

function Views(database_url, database_name, views_directory) {
	this.database_url = database_url;
	this.database_name = database_name;
	this.views_directory = (!views_directory)? '../views' : views_directory;

	console.log(process.env.NODE_ENV);

	if(((process.env.NODE_ENV) || 'development') == 'development') {
		console.log("============================================");
		console.log("Starting the Views Creation");
		console.log("Database URL  		:"+this.database_url);
		console.log("Database Name 		:"+this.database_name);
		console.log("Views Directory 	:"+this.views_directory);
		console.log("============================================");
	}
	
}

Views.prototype.constructor = Views;

Views.prototype.create = function() {
	var sync_deferred = Q.defer();

	console.log('Create the Views');
	
	Q.all(this._getViewsNames().map(this._checkDesignDocument, this))
		.then(function(){
			sync_deferred.resolve(200);
		});

	return sync_deferred.promise;
};

Views.prototype.getViews = function() {

};

Views.prototype._getViewsNames = function() {
	var self = this;
	return fs.readdirSync(this.views_directory).map(function(file){
		return {
			"filename"		: file,
			"design_name" 	: file.slice(0,file.length-8),
			"views"			: require(self.views_directory+"/"+file)
		};
	});
};

/**
 * Check if the Design Document already exists in the Database
 * @param design_name Document Design Name
 * @param views Views functions of the design document
 * @param "visitors_wallet" Database name
 */
Views.prototype._checkDesignDocument = function(view) {
	var deferred = Q.defer();

	var self = this;

	//design_name, views
	var design_name = "_design/"+view.design_name;
	var views 		= view.views;

	Cloudant(self.database_url).use(self.database_name)
		.get(design_name, function(err, design_document) {
			
			if(err && err.statusCode == 404) {
				self._insertDesignDocument(null, design_name, views).then(function(){
					deferred.resolve();
				}).catch(function(err){
					deferred.reject(err);
				});
				return;
			} else if(err) {
				deferred.reject(err);
				return;
			}

			if(equal(design_document.views, views)) {
				deferred.resolve(200);
				return;
			} else {
				self._insertDesignDocument(design_document ,design_name, views).then(function(){
					deferred.resolve();
				}).catch(function(err){
					deferred.reject(err);
				});
				return;
			}
		});
	return deferred.promise;
};

/**
 * Create / Update the Design Document Name
 * @param design_name Document Design Name
 * @param views Views functions of the design document
 * @param "visitors_wallet" Database name
 * @private
 */
Views.prototype._insertDesignDocument = function(design_document, design_name, views) {
	var deferred = Q.defer();

	var self = this;

	if(!design_document) {
		design_document = {
			language: 'javascript',
			views: {}
		};
	}
	design_document.views = views;

	Cloudant(self.database_url).use(self.database_name)
		.insert(design_document, design_name, function(err) {
			if(err && err.statusCode === 409) {

				Cloudant(self.database_url).use(self.database_name).destroy(design_name, function(err) {
					if(err) {
						deferred.reject(err);
						return;
					}
					self._checkTheDesignDocument(design_name, views, cb).then(function(){
						deferred.resolve();
					}).catch(function(err){
						deferred.reject(err);
					});
					return;
				});
			} else {
				deferred.resolve(true);
			}
		});

	return deferred.promise;
};

module.exports = Views;
