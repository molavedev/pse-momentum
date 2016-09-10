var rx = require('rxjs/Rx');
var request = require('request');
var fs = require('fs');
var RSVP = require('rsvp');
var tidy = require('htmltidy').tidy;


var CURR_DIR = 'downloads/2016-september-10'
var LAST_MONTH = '2016-08-10';
// http://phisix-api.appspot.com/stocks/

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


function saveToFile(fileName, textToSave) {
	fs.writeFile(fileName, textToSave, fsCallback);	
}

function getStocks(siteUrl) {
	var allStocksFile = CURR_DIR + "/all_stocks.txt"
	try {
		var body = fs.readFileSync(allStocksFile);
		return rx.Observable.create(function (observer) {
			console.log('reading from file');
	        json_data = JSON.parse(body);
    		json_data.stock.forEach(function(s) {
    			observer.next(s);
    		})
    		observer.complete();
	    });
	} catch (err) {
		return rx.Observable.create(function (observer) {
			console.log('making an http get request')
	        request.get(siteUrl, function(error, response, body) {
	            if (error) { 
	            	observer.error(); 
	            	console.log("error");
	            } else { 
					fs.writeFile(allStocksFile, body, fsCallback);	            	
					json_data = JSON.parse(body);
		    		json_data.stock.forEach(function(s) {
		    			observer.next(s);
		    		})
	            }
	            observer.complete();
	        });
	    });
	}
}

function getOneYearReturnFromLines(stock, body) {
	var promise = new RSVP.Promise(function(resolve, reject) {
		tidy(body, function(err, html) {
	    	//fs.writeFile(CURR_DIR+ '/' + stock.symbol + '-tidy', html, fsCallback);;

	    	var result = NaN;

	    	var oneYearReturnStr = '1 Yr Return';
			var lines = html.split('\n');
			var arraylength = lines.length;
			for (var i = 0; i < arraylength; i++) {
				if (lines[i].indexOf(oneYearReturnStr) !== -1) {
					var oneYearReturn = lines[i+1]; //actual 1-year return is in the next line
					oneYearReturn = oneYearReturn.substring(oneYearReturn.indexOf('>') + 1)
					oneYearReturn = oneYearReturn.substring(0, oneYearReturn.indexOf('%'));
					//console.log(stock.symbol + ": " + oneYearReturn)
					result = parseFloat(oneYearReturn); 
					resolve(result);

					break;
				}
			}

			if (isNaN(result)) {
				reject(this);
			}
		});
	});
 	return promise;
}


var fsCallback = function(err) {
    if (err) {
        return console.log(err);
    }
}



function momentum() {
	if (!fs.existsSync(CURR_DIR)){
    	fs.mkdirSync(CURR_DIR);
	}

	var jsonPseUrl = 'http://phisix-api.appspot.com/stocks.json';
	var momentumStocks = CURR_DIR + "/momentum_stocks.csv"
	var momentumHeader = "symbol, price, volume, 1-year-return, last_month_price, last_month_volume \n";
	fs.writeFile(momentumStocks, momentumHeader, fsCallback);

	var source1 = rx.Observable
		.interval(1000);
		//.take(5);
	var source2 = getStocks(jsonPseUrl);
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
            	return getOneYearReturnFromLines(stock, body);
            }, function(error) {
            	console.log(stock.symbol + ": error getting bloomberg data");
            }).then(function(oneYearReturnFromBloomberg) {
            	console.log(stock.symbol + " - final 1 year return: " + oneYearReturnFromBloomberg);
            	var newStock = stock;
				var oneYear = oneYearReturnFromBloomberg;
				newStock.one_year_return = oneYear;
				return newStock;
            }, function(error) {
            	console.log(stock.symbol + ": error parsing bloomberg data");
            });

            //return rx.Observable.fromPromise(newPromise);

    	}) 
    .concatAll()
    .map(function(stock) {
    	console.log("phisix-api: " + stock);
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

momentum()