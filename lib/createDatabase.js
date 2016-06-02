var Cloudant	= require('cloudant');
var Q       	= require('q');
var Config  	= require('./index');

function Database(database_url, database_name) {
	this.database_url = database_url;
	this.database_name = database_name;

	if(((process.env.NODE_ENV) || 'development') == 'development') {
		console.log("============================================");
		console.log("Starting the Database");
		console.log("Database URL  		:"+this.database_url);
		console.log("Database Name 		:"+this.database_name);
		console.log("============================================");
	}
} 

Database.prototype.create = function() {
	var deferred = Q.defer();

	var database_name = this.database_name;
	var database_url = this.database_url;

	Cloudant(database_url).db.get(database_name, function(err,database){
		if(database) {
			console.log("Database is already created : "+database_name);
			deferred.resolve(200);
		} else if (err && err.statusCode == '404'){
			Cloudant(database_url).db.create(database_name, function(err) {
				if (err) {
					console.log('Error creating database');
					deferred.reject(err.stack);
				} else {
					console.log('DB '+database_name+' created!');
					deferred.resolve(200);
				}
			});
		} else if(err){
			console.log('Error creating database');
			deferred.reject(err.stack);
		}
	});

	return deferred.promise;
};

Database.prototype.delete = function() {
	var deferred = Q.defer();
	// Cloudant(this.database_url).db.destroy(this.database_name,function(err, body){
	// 	console.log(err);
	// 	console.log(body);

		deferred.resolve();
	// });

	return deferred.promise;
}

module.exports = Database;
