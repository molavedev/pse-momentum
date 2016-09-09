var rx = require('rxjs/Rx');
var request = require('request');
var request = require('request');
var fs = require('fs');
//var webdriverio = require('webdriverio');
var RSVP = require('rsvp');
//const RxHttpRequest = require('rx-http-request').RxHttpRequest;
var sleep = require('system-sleep');

//var options = { desiredCapabilities: { browserName: 'chrome' } };
//var client = webdriverio.remote(options);


var CURR_DIR = 'downloads/2016-august-28'
var LAST_MONTH = '2016-07-28';

var FIVE_MILLION = 5000000; 
var TWO_MILLION = 2000000;
var ONE_MILLION = 1000000;
var HUNDRED_MILLION = 500000000;

//CHP is not yet one year old, etc
var stocksToSkip = ['CHP', 'HVN', 'IDC', 'SBS', 'MRSGI'];

function readFile(filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.log("error reading file: " + filePath);
            defer.reject("Error:" + filePath + " not found.")
        } else {
            console.log("success reading file: " + filePath);
            var oneYearData = JSON.parse(data);
            defer.fulfill(oneYearData);
        }
    });
    return defer.promise;    
}

function httpGetRx(siteUrl) {
    return rx.Observable.create(function (observer) {
        request.get(siteUrl, function(error, response, body) {
            if (error) { observer.error(); console.log("error");}
            else { 
            	observer.next({response: response, body: body });
            }
            observer.complete();
        });
    });
}

function saveToFile(fileName, textToSave) {
	fs.writeFile(fileName, textToSave, fsCallback);	
}

function getStocks(siteUrl) {
	var allStocksFile = CURR_DIR + "/all_stocks.txt"
	try {
		var body = fs.readFileSync(allStocksFile);
		return rx.Observable.create(function (observer) {
			console.log('reading from file');
			observer.next({body: body});
	        observer.complete();
	    });
	} catch (err) {
		return rx.Observable.create(function (observer) {
			console.log('making an http get request')
	        request.get(siteUrl, function(error, response, body) {
	            if (error) { observer.error(); console.log("error");}
	            else { 
	            	observer.next({body: body});
					fs.writeFile(allStocksFile, body, fsCallback);	            	
	            }
	            observer.complete();
	        });
	    });
	}
}

function getOneYearReturnFromLines(body) {
	var oneYearReturnStr = '1 Yr Return';
	var lines = body.split('\n');
	var arraylength = lines.length;
	for (var i = 0; i < arraylength; i++) {
		if (lines[i].indexOf(oneYearReturnStr) !== -1) {
			var oneYearReturn = lines[i+3];
			oneYearReturn = oneYearReturn.replace('%', '').trim();
			//console.log(stock.symbol + ": " + oneYearReturn)
			return parseFloat(oneYearReturn);
		}
	}
}


var fsCallback = function(err) {
    if (err) {
        return console.log(err);
    }
}

function generateMomentum() {
	var jsonPseUrl = 'http://phisix-api.appspot.com/stocks.json';
	var momentumStocks = CURR_DIR + "/momentum_stocks.csv"
	var momentumHeader = "symbol, price, volume, 1-year-return, last_month_price, last_month_volume \n";
	fs.writeFile(momentumStocks, momentumHeader, fsCallback);

	//var pldt = "http://markets.ft.com/data/equities/tearsheet/summary?s=TEL:PHS";
	var pldt = 'http://www.bloomberg.com/quote/TEL:PM';

	var pldtFile = CURR_DIR + "/pldt.txt"
	request.get(pldt, function(error, response, body) {
            if (error) { console.log("pldt error");}
            else { 
            	fs.writeFile(pldtFile, body, fsCallback);
            }
        });

	//var combination = Rx.Observable.concat(source1, source2);
	//concat observables later that have an interval 

	var source1 = rx.Observable
		.interval(2000)
		.take(4);
	var source2 = getStocks3(jsonPseUrl);
	var source = rx.Observable.zip(source1, source2);
	//getStocks(jsonPseUrl)
		source.map(function(zipResult) {
			return zipResult[1]
		})
    	.filter(function(stock) {
    		var dailyValue = stock.price.amount*stock.volume;
            var exceedsValueThreshold = (dailyValue >= HUNDRED_MILLION);
            var isPreferredShare = stock.name.toUpperCase().includes("PREF");
            var inSkippedStocks = stocksToSkip.indexOf(stock.symbol);
            return (exceedsValueThreshold && !isPreferredShare && (inSkippedStocks < 0));
    	})

    	.map( function(stock) {

			var siteUrl = 'http://www.bloomberg.com/quote/' + stock.symbol + ':PM';
	 		var stockFile = CURR_DIR + "/" + stock.symbol + ".txt";

	 		 
             var promise = new RSVP.Promise(function(resolve, reject) {
				try {
					result = fs.readFileSync(stockFile, "utf-8");
					resolve(result)
					console.log(stock.symbol + ": getting data from filesystem");
				} catch (err) { 
					console.log(stock.symbol + ": getting data from bloomberg");
			     	request.get(siteUrl, function(error, response, body) {
			            if (error) {          	
			            	reject(this);
			            }
			            else { 
			            	fs.writeFile(stockFile, body, fsCallback);
			            	resolve(body)
			            	//sleep(15000);		        	            	
			            }
			        });
			        //sleep(10000);
			    }    
		     })           

            return promise.then(function(body) {
            	var newStock = stock;
				var oneYear = getOneYearReturnFromLines(body);
				newStock.one_year_return = oneYear;
				return newStock;
            }, function(error) {
            	console.log(stock.symbol + ": error getting bloomberg data");
            })

    	}) 
    	.concatAll()
    	.map(function(stock) {
    		var stockUrl = "http://phisix-api.appspot.com/stocks/" + 
                        stock.symbol + '.' + LAST_MONTH + '.json';
            var stockFile = CURR_DIR + "/" + stock.symbol + "-last_month.txt";            
             //console.log(stockUrl);           
             var promise = new RSVP.Promise(function(resolve, reject) {
             	try {
					result = fs.readFileSync(stockFile, "utf-8");
					resolve(result)
					console.log(stock.symbol + ": getting last-month data from filesystem");
				} catch (err) { 
					console.log(stock.symbol + ": getting last-month data from api");
					//console.log(stockUrl);
					request.get(stockUrl, function(error, response, body) {
			            if (error) {     	
			            	reject(this);
			            }
			            else { 
			            	//sleep(10000);
			            	fs.writeFile(stockFile, body, fsCallback);
			            	resolve(body)			            			        	            	
			            }
			        });
			        //sleep(10000);
				}	
             })           

            return promise.then(function(body) {

            	console.log(stock.symbol + " last month:" + body);
            	//console.log(stock.symbol + " last month: " + json_data.stock[0].price.amount);
            	var newStock = stock;
            	if (body === "" ) {
            		newStock.last_month_price = 0;
					newStock.last_month_volume = 0;
            	} else {
	            	json_data = JSON.parse(body);				            	
					newStock.last_month_price = json_data.stock[0].price.amount;
					newStock.last_month_volume = json_data.stock[0].volume;	
            	}
            	return newStock;
            }, function(error) {
            	console.log(stock.symbol + ": error getting last month stock data");
            }) 
    	})
    	.concatAll()
    	.map(function(stock) {
    		console.log("single: " + JSON.stringify(stock));
    		var stockCSV = stock.symbol + ", " + stock.price.amount + ", " + 
    					   stock.volume + "," + stock.one_year_return + ", " + 
    					   stock.last_month_price + "," + stock.last_month_volume + "\n";
    		fs.appendFile(momentumStocks, stockCSV, fsCallback);
    	}) 
    	
    	.subscribe( );
}

//generateMomentum();

var source = rx.Observable
    .interval(5000 /* ms */)
    .timeInterval()
    .take(3);

//source.subscribe();    



function getStocks3(siteUrl) {
	var allStocksFile = CURR_DIR + "/all_stocks.txt"
	return rx.Observable.create(function (observer) {
		console.log('making an http get request')
        request.get(siteUrl, function(error, response, body) {
            if (error) { observer.error(); console.log("error");}
            else { 
            	json_data = JSON.parse(body);
        		json_data.stock.forEach(function(s) {
        			observer.next(s);
        		})			            	
            }
            observer.complete();
        });
    });
}

function getStocks2(siteUrl) {
	var allStocksFile = CURR_DIR + "/all_stocks.txt"

	var promise = new RSVP.Promise(function(resolve, reject) {
		try {
			result = fs.readFileSync(stockFile, "utf-8");
			json_data = JSON.parse(result);
	        resolve(json_data.stock)
			console.log(stock.symbol + ": getting data from filesystem");
		} catch (err) { 
			console.log(stock.symbol + ": getting data from bloomberg");
	     	request.get(siteUrl, function(error, response, body) {
	            if (error) {          	
	            	reject(this);
	            }
	            else { 
	            	fs.writeFile(stockFile, body, fsCallback);
	            	json_data = JSON.parse(httpResult.body);
	            	resolve(json_data.stock)	            		        	            	
	            }
	        });
	    }    
     })

    return promise;
}

var array = [43, 45, 57];

function testRX() {
	var jsonPseUrl = 'http://phisix-api.appspot.com/stocks.json';
	var momentumStocks = CURR_DIR + "/momentum_stocks.csv"
	var momentumHeader = "symbol, price, volume, 1-year-return, last_month_price, last_month_volume \n";
	fs.writeFile(momentumStocks, momentumHeader, fsCallback);

	var source1 = rx.Observable
		.interval(10000);
		//.take(10);
	var source2 = getStocks3(jsonPseUrl);
	rx.Observable.zip(source1, source2)
	.map(function(stock) {
		return stock[1];
	})
	.filter(function(stock) {
    		var dailyValue = stock.price.amount*stock.volume;
            var exceedsValueThreshold = (dailyValue >= ONE_MILLION);
            //var exceedsValueThreshold = (dailyValue >= 0);
            var isPreferredShare = stock.name.toUpperCase().includes("PREF") || stock.name.toUpperCase().includes(" PDR");
            var inSkippedStocks = stocksToSkip.indexOf(stock.symbol);
            return (exceedsValueThreshold && !isPreferredShare && (inSkippedStocks < 0));
    	})
	.map( function(stock) {
			var siteUrl = 'http://www.bloomberg.com/quote/' + stock.symbol + ':PM';
	 		var stockFile = CURR_DIR + "/" + stock.symbol + ".txt";

			var promise = new RSVP.Promise(function(resolve, reject) {
				try {
					result = fs.readFileSync(stockFile, "utf-8");
					resolve(result)
					console.log(stock.symbol + ": getting data from filesystem");
				} catch (err) { 
					console.log(stock.symbol + ": getting data from bloomberg");
				 	request.get(siteUrl, function(error, response, body) {
				        if (error) {          	
				        	reject(this);
				        }
				        else { 
				        	fs.writeFile(stockFile, body, fsCallback);
				        	resolve(body)
				        }
				    });
				}    
			})           

            return promise.then(function(body) {
            	var newStock = stock;
				var oneYear = getOneYearReturnFromLines(body);
				newStock.one_year_return = oneYear;
				return newStock;
            }, function(error) {
            	console.log(stock.symbol + ": error getting bloomberg data");
            })

    	}) 
    .concatAll()
    .map(function(stock) {
		var stockUrl = "http://phisix-api.appspot.com/stocks/" + 
                    stock.symbol + '.' + LAST_MONTH + '.json';
        var stockFile = CURR_DIR + "/" + stock.symbol + "-last_month.txt";            
         var promise = new RSVP.Promise(function(resolve, reject) {
         	try {
				result = fs.readFileSync(stockFile, "utf-8");
				resolve(result)
				console.log(stock.symbol + ": getting last-month data from filesystem");
			} catch (err) { 
				console.log(stock.symbol + ": getting last-month data from api");
				request.get(stockUrl, function(error, response, body) {
		            if (error) {     	
		            	reject(this);
		            }
		            else { 
		            	fs.writeFile(stockFile, body, fsCallback);
		            	resolve(body)			            			        	            	
		            }
		        });
			}	
         })           

        return promise.then(function(body) {

        	//console.log(stock.symbol + " last month:" + body);
        	var newStock = stock;
        	if (body === "" ) {
        		newStock.last_month_price = 0;
				newStock.last_month_volume = 0;
        	} else {
            	json_data = JSON.parse(body);				            	
				newStock.last_month_price = json_data.stock[0].price.amount;
				newStock.last_month_volume = json_data.stock[0].volume;	
        	}
        	return newStock;
        }, function(error) {
        	console.log(stock.symbol + ": error getting last month stock data");
        }) 
	})
	.concatAll()
	.map(function(stock) {
		console.log(stock);
		var stockCSV = stock.symbol + ", " + stock.price.amount + ", " + 
    					   stock.volume + "," + stock.one_year_return + ", " + 
    					   stock.last_month_price + "," + stock.last_month_volume + "\n";
    	fs.appendFile(momentumStocks, stockCSV, fsCallback);
	})
	.subscribe()
}

testRX()