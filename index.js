var Q	= require('q');

var createDatabase  		= require('./createDatabase');
var createViews     		= require('./createViews');
var populateDatabase		= require('./populateDatabase');

module.exports = Database;

function Database(database_url, database_name) {
	this.database_url = database_url;
	this.database_name = database_name;
}

Database.prototype.init = function() {
	var deferred = Q.defer();

	if(((process.env.NODE_ENV) || 'development') == 'development') {
		console.log("============================================");
		console.log("BEGIN - Cloudant Initializer");
	}

	var database = new createDatabase(this.database_url,this.database_name);
	var views 	 = new createViews(this.database_url,this.database_name);
	//var populate = new populateDatabase(database_url,database_name);

	database.create()
		.then(function(){
			return views.create();
		})
		.then(function(){
			console.log("All Done");
			deferred.resolve(200);
		})
		.catch(function(err){
			console.log("Something Went Wrong !");
			console.log(err);
			console.log(err.stack);
			deferred.reject(err);
		});

	if(((process.env.NODE_ENV) || 'development') == 'development') {
		console.log("END - Cloudant Initializer");
		console.log("============================================");
	}

	return deferred.promise;
}

