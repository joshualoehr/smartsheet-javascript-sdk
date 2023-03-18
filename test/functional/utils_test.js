var should = require('should');
var request = require('request');
var sinon = require('sinon');
var Promise = require('bluebird');
var _ = require('underscore');
var packageJson = require('../../package.json');
var fs = require('fs');

var requestor = require('../../lib/utils/httpRequestor').create({request: request});

var winston = require('winston');
const { smartSheetURIs } = require('../..');
var createRequestLogger = require('../../lib/utils/requestLogger').create;

var sample = {
  name : 'name'
};

var sampleRequest = {
  url:'URL',
  accessToken:'TOKEN'
};

var sampleRequestNoContentType = {
  accessToken: 'TOKEN',
  body: sample
};

var sampleRequestWithQueryParameters = {
  accessToken: 'TOKEN',
  contentType: 'application/json',
  body: sample,
  queryParameters: {
    parameter1:'',
    parameter2:''
  }
};

var EXPECTED_VERSION = packageJson.version;

describe('Utils Unit Tests', function() {
  describe('#HttpRequestor', function() {
    it('should have GET method', () => requestor.should.have.property('get'));

    it('should have POST method', () => requestor.should.have.property('post'));

    it('should have POST file method', () => requestor.should.have.property('postFile'));

    it('should have PUT method', () => requestor.should.have.property('put'));

    it('should have DELETE method', () => requestor.should.have.property('delete'));

    describe('#buildUrl', function() {
      var host = null;

      beforeEach(() => {
        host = process.env.SMARTSHEET_API_HOST = 'host/';
      });

      afterEach(() => {
        process.env.SMARTSHEET_API_HOST = '';
        host = null;
      });

      it('should return the set HOST with URL appended', () => {
        var url = 'test';
        var builtUrl = requestor.internal.buildUrl({url:url});
        builtUrl.should.equal(host + url);
      });

      it('url should equal https://api.smartsheet.com/2.0/', () => {
        process.env.SMARTSHEET_API_HOST = '';
        var builtUrl = requestor.internal.buildUrl({});
        builtUrl.should.equal('https://api.smartsheet.com/2.0/');
      });

      it('url should equal https://api.smartsheetgov.com/2.0', () => {
        var url = 'https://api.smartsheetgov.com/2.0';
        var builtUrl = requestor.internal.buildUrl({baseUrl:url});
        builtUrl.should.equal('https://api.smartsheetgov.com/2.0');
      });

      it('prefers baseUrl over env var', () => {
        var builtUrl = requestor.internal.buildUrl({baseUrl: 'base url'});
        builtUrl.should.equal('base url');
      });

      it('prefers baseUrl over default', () => {
        process.env.SMARTSHEET_API_HOST = '';
        var builtUrl = requestor.internal.buildUrl({baseUrl: 'base url'});
        builtUrl.should.equal('base url');
      });

      it('url should contain the host + url', () => {
        var builtUrl = requestor.internal.buildUrl({url: 'url/'});
        builtUrl.should.equal(host + 'url/');
      });

      it('url should contain the ID', () => {
        var builtUrl = requestor.internal.buildUrl({url: 'url/', id: '123'});
        builtUrl.should.equal(host + 'url/123');
      });
    });

    describe('#buildHeaders', function() {
      var newType = 'text/xml';
      var applicationJson = 'application/json';
      var fsStub = null;

      beforeEach(() => {
        fsStub = sinon.stub(fs, 'statSync');
        fsStub.returns({size: 234});
      });

      afterEach(() => {
        fsStub.restore();
      });

      it('authorization header should have token', () => {
        var headers = requestor.internal.buildHeaders({accessToken: 'token'});
        headers.Authorization.should.equal('Bearer token');
      });

      it('accept header should equal ' + applicationJson, () => {
        var headers = requestor.internal.buildHeaders({});
        headers.Accept.should.equal(applicationJson);
      });

      it('accept header should equal ' + newType, () => {
        var headers = requestor.internal.buildHeaders({accept: newType});
        headers.Accept.should.equal(newType);
      });

      it('content-type header should ' + applicationJson, () => {
        var headers = requestor.internal.buildHeaders({contentType: applicationJson});
        headers['Content-Type'].should.equal(applicationJson);
      });

      it('content-type header should equal ' + newType, () => {
        var headers = requestor.internal.buildHeaders({contentType: newType});
        headers['Content-Type'].should.equal(newType);
      });

      it('Content-Disposition should equal filename', () => {
        var headers = requestor.internal.buildHeaders({fileName: 'test'});
        headers['Content-Disposition'].should.equal('attachment; filename="test"');
      });

      it('Should set Content-Disposition to contentDisposition', () => {
        var headers = requestor.internal.buildHeaders({contentDisposition: 'some content disposition'});
        headers['Content-Disposition'].should.equal('some content disposition');
      });

      it('Should prefer contentDisposition to fileName', () => {
        var headers = requestor.internal.buildHeaders({fileName: 'test', contentDisposition: 'something else'});
        headers['Content-Disposition'].should.equal('something else');
      });

      it('Should set Content-Length to fileSize', () => {
        var headers = requestor.internal.buildHeaders({fileName: 'test',   fileSize: 123});
        headers['Content-Length'].should.equal(123);
      });

      it('Should set Content-Length from file size when path is specified', () => {
        var headers = requestor.internal.buildHeaders({fileName: 'test',   path: "somePath"});
        headers['Content-Length'].should.equal(234);
      });

      it('Should prefer path over fileSize for Content-Length', () => {
        var headers = requestor.internal.buildHeaders({fileName: 'test',   path: "somePath", fileSize: 123});
        headers['Content-Length'].should.equal(234);
      });

      it('Assume-User should equal URI encoded email', () => {
        var headers = requestor.internal.buildHeaders({assumeUser: 'john.doe@smartsheet.com'});
        headers['Assume-User'].should.equal('john.doe%40smartsheet.com');
      });

      it('Should set the user agent string based on the version', () => {
        var headers = requestor.internal.buildHeaders({});
        headers['User-Agent'].should.equal(`smartsheet-javascript-sdk/${packageJson.version}`);
      });

      it('Should used a passed in value for the user agent string', () => {
        var headers = requestor.internal.buildHeaders({userAgent: 'someAgentString'});
        headers['User-Agent'].should.equal(`smartsheet-javascript-sdk/${packageJson.version}/someAgentString`);
      });

      it('Custom properties should be allowed', () => {
        var headers = requestor.internal.buildHeaders({customProperties: {custom1: 'value', custom2: 'value2'}});
        headers['custom1'].should.equal('value');
        headers['custom2'].should.equal('value2');
      });
    });
  });

  describe('#GET', function() {
    describe('#Successful request', function() {
      var requestStub = null;
      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'getAsync');
        var mockResponse = {
          statusCode: 200,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        var mockBody = '{"hello":"world"}';
        requestStub.returns(Promise.resolve([mockResponse, mockBody]));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should resolve promise as true', () =>
        stubbedRequestor.get(sampleRequest)
          .should.eventually.be.true);

      it('request should call callback as true', function(done) {
        stubbedRequestor.get(sampleRequest, function(err, data) {
          data.should.be.true;
          done();
        });
      });
    });

    describe('#Error on request', function() {
      var requestStub = null;
      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});
      var mockBody;

      beforeEach(() => {
        requestStub = sinon.stub(request, 'getAsync');
        var mockResponse = {
          statusCode: 403,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        mockBody = {error:true};
        requestStub.returns(Promise.reject(mockBody));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should error as false, using promises', () =>
        stubbedRequestor
          .get(sampleRequest)
          .catch(error => error.error.should.be.true));

      it('request should error as false, using callbacks', (done) => {
        stubbedRequestor
          .get(sampleRequest,
               (err, data) => {
                 err.should.be.eql(mockBody);
                 done();
                });
      });
    });

    describe('#Arguments', function() {
      var spyGet;

      beforeEach(() => {
        spyGet = sinon.spy(request, 'getAsync');
      });

      afterEach(() => {
        spyGet.restore();
      });

      it('headers sent as part of request should match given', () => {
        var sampleHeaders = {
          Authorization: 'Bearer TOKEN',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `smartsheet-javascript-sdk/${EXPECTED_VERSION}`
        };
        requestor.get(sampleRequest);
        spyGet.args[0][0].headers.Authorization.should.equal(sampleHeaders.Authorization);
        spyGet.args[0][0].headers.Accept.should.equal(sampleHeaders.Accept);
        spyGet.args[0][0].headers['Content-Type'].should.equal(sampleHeaders['Content-Type']);
        spyGet.args[0][0].headers['User-Agent'].should.equal(sampleHeaders['User-Agent']);
      });

      it('url sent to request should match given', () => {
        requestor.get(sampleRequest);
        spyGet.args[0][0].url.should.equal('https://api.smartsheet.com/2.0/URL');
      });

      it('queryString sent to request should match given', () => {
        requestor.get(sampleRequestWithQueryParameters);
        spyGet.args[0][0].qs.should.equal(sampleRequestWithQueryParameters.queryParameters);
      });
    });

    describe('#Retry', function() {
      var requestStub = null;
      var handleResponseStub = sinon.stub();
      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: handleResponseStub});
      var sampleRequestForRetry = null;

      function givenGetReturnsError() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns(Promise.reject({errorCode: 4001}));
      }

      function givenGetReturnsSuccess() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns({content: true});
      }

      function givenEarlyExitBackoff() {
        sampleRequestForRetry.calcRetryBackoff = numRetry => numRetry == 1 ? -1 : 1;
      }

      function givenBackoffDependsOnError() {
        sampleRequestForRetry.calcRetryBackoff = (numRetry, error) => {
          if(error.errorCode == 4001) return numRetry == 1 ? -1 : 1;
          else throw new Error('Error object not provided to backoff');
        };
      }

      beforeEach(() => {
        requestStub = sinon.stub(request, 'getAsync');
        sampleRequestForRetry = _.extend({}, sampleRequest);
        sampleRequestForRetry.maxRetryDurationMillis = 30;
        sampleRequestForRetry.calcRetryBackoff = function (numRetry) {return Math.pow(3, numRetry);};
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('get called once on success', () => {
        givenGetReturnsSuccess();
        return stubbedRequestor
          .get(sampleRequestForRetry)
          .then(data => requestStub.callCount.should.equal(1));
      });

      it('get retried on error', () => {
        givenGetReturnsError();
        return stubbedRequestor
          .get(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.be.above(1));
      });

      it('get stops retrying when receiving a negative backoff', () => {
        givenGetReturnsError();
        givenEarlyExitBackoff();
        return stubbedRequestor
          .get(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });

      it('get passes the causing error to the backoff function', () => {
        givenGetReturnsError();
        givenBackoffDependsOnError();
        return stubbedRequestor
          .get(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });
    });
  });

  describe('#POST', function() {
    describe('#Successful request', function() {
      var requestStub = null;

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'postAsync');
        var mockResponse = {
          statusCode: 200,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        var mockBody = '{"hello":"world"}';
        requestStub.returns(Promise.resolve([mockResponse, mockBody]));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should resolve as true', () =>
        stubbedRequestor
          .post(sampleRequest)
          .then(data => data.should.be.true));

      it('request should call callback as true', (done) => {
        stubbedRequestor.post(sampleRequest, function(err, data) {
          data.should.be.true;
          done();
        });
      });
    });

    describe('#Error on request', function() {
      var requestStub = null;
      var mockBody = {error:true};

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'postAsync');
        requestStub.returns(Promise.reject(mockBody));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should error as false', () =>
        stubbedRequestor
          .post(sampleRequest)
          .catch(error => error.error.should.be.true));

      it('request should error as false', (done) => {
        stubbedRequestor
          .post(sampleRequest,
                (err, data) => {
                  err.should.be.eql(mockBody);
                  done();
                });
      });
    });

    describe('#Arguments', function() {
      var spyPost;

      beforeEach(() => {
        spyPost = sinon.spy(request, 'postAsync');
      });

      afterEach(() => {
        spyPost.restore();
      });

      it('headers sent as part of request should match given', () => {
        var sampleHeaders = {
          Authorization: 'Bearer TOKEN',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `smartsheet-javascript-sdk/${EXPECTED_VERSION}`
        };
        requestor.post(sampleRequest);
        spyPost.args[0][0].headers.Authorization.should.equal(sampleHeaders.Authorization);
        spyPost.args[0][0].headers.Accept.should.equal(sampleHeaders.Accept);
        spyPost.args[0][0].headers['Content-Type'].should.equal(sampleHeaders['Content-Type']);
        spyPost.args[0][0].headers['User-Agent'].should.equal(sampleHeaders['User-Agent']);
      });

      it('url sent to request should match given', () => {
        requestor.post(sampleRequest);
        spyPost.args[0][0].url.should.equal('https://api.smartsheet.com/2.0/URL');
      });

      it('queryString sent to request should match given', () => {
        requestor.post(sampleRequestWithQueryParameters);
        spyPost.args[0][0].qs.should.equal(sampleRequestWithQueryParameters.queryParameters);
      });

      it('body sent to request should match given', () => {
        requestor.post(sampleRequestWithQueryParameters);
        spyPost.args[0][0].body.should.equal(JSON.stringify(sampleRequestWithQueryParameters.body));
      });
    });

    describe('#Retry', function() {
      var requestStub = null;
      var handleResponseStub = sinon.stub();

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: handleResponseStub});

      var sampleRequestForRetry;

      function givenPostReturnsError() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns(Promise.reject({errorCode: 4001}));
      }

      function givenPostReturnsSuccess() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns({content: true});
      }

      function givenEarlyExitBackoff() {
        sampleRequestForRetry.calcRetryBackoff = numRetry => numRetry == 1 ? -1 : 1;
      }

      function givenBackoffDependsOnError() {
        sampleRequestForRetry.calcRetryBackoff = (numRetry, error) => {
          if(error.errorCode == 4001) return numRetry == 1 ? -1 : 1;
          else throw new Error('Error object not provided to backoff');
        };
      }

      beforeEach(() => {
        requestStub = sinon.stub(request, 'postAsync');

        sampleRequestForRetry = _.extend({}, sampleRequest);
        sampleRequestForRetry.maxRetryDurationMillis = 30;
        sampleRequestForRetry.calcRetryBackoff = function (numRetry) {return Math.pow(3, numRetry);};
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('post called once on success', () => {
        givenPostReturnsSuccess();
        return stubbedRequestor
          .post(sampleRequestForRetry)
          .then(data => requestStub.callCount.should.equal(1));
      });

      it('post retried on error', () => {
        givenPostReturnsError();
        return stubbedRequestor
          .post(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.be.above(1));
      });

      it('post stops retrying when receiving a negative backoff', () => {
        givenPostReturnsError();
        givenEarlyExitBackoff();
        return stubbedRequestor
          .post(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });

      it('post passes the causing error to the backoff function', () => {
        givenPostReturnsError();
        givenBackoffDependsOnError();
        return stubbedRequestor
          .post(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });
    });
  });

  describe('#PUT', function() {
    describe('#Successful request', function() {
      var requestStub = null;

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'putAsync');
        var mockResponse = {
          statusCode: 200,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        var mockBody = '{"hello":"world"}';
        requestStub.returns(Promise.resolve([mockResponse, mockBody]));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should resolve as true', () =>
        stubbedRequestor
          .put(sampleRequest)
          .then(data => data.should.be.true));

      it('request should call callback as true', (done) => {
        stubbedRequestor
          .put(sampleRequest,
               (err, data) => {
                 data.should.be.true;
                 done();
                });
      });
    });

    describe('#Error on request', function() {
      var stub = null;
      var mockBody = {error: true};

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        stub = sinon.stub(request, 'putAsync');
        var mockResponse = {
          statusCode: 403,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        stub.returns(Promise.reject(mockBody));
      });

      afterEach(() => {
        stub.restore();
      });

      it('request should error as false', () =>
        stubbedRequestor
          .put(sampleRequest)
          .catch(error => error.error.should.be.true));

      it('request should error as false', (done) => {
        stubbedRequestor
          .put(sampleRequest,
               (err, data) => {
                 err.should.eql(mockBody);
                 done();
                });
      });
    });

    describe('#Arguments', function() {
      var spyPut;

      beforeEach(() => {
        spyPut = sinon.spy(request, 'putAsync');
      });

      afterEach(() => {
        spyPut.restore();
      });

      it('headers sent as part of request should match given', () => {
        var sampleHeaders = {
          Authorization: 'Bearer TOKEN',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `smartsheet-javascript-sdk/${EXPECTED_VERSION}`
        };
        requestor.put(sampleRequest);
        spyPut.args[0][0].headers.Authorization.should.equal(sampleHeaders.Authorization);
        spyPut.args[0][0].headers.Accept.should.equal(sampleHeaders.Accept);
        spyPut.args[0][0].headers['Content-Type'].should.equal(sampleHeaders['Content-Type']);
        spyPut.args[0][0].headers['User-Agent'].should.equal(sampleHeaders['User-Agent']);
      });

      it('url sent to request should match given', () => {
        requestor.put(sampleRequest);
        spyPut.args[0][0].url.should.equal('https://api.smartsheet.com/2.0/URL');
      });

      it('queryString sent to request should match given', () => {
        requestor.put(sampleRequestWithQueryParameters);
        spyPut.args[0][0].qs.should.equal(sampleRequestWithQueryParameters.queryParameters);
      });

      it('body sent to request should match given', () => {
        requestor.put(sampleRequestWithQueryParameters);
        spyPut.args[0][0].body.should.equal(JSON.stringify(sampleRequestWithQueryParameters.body));
      });
    });

    describe('#Retry', function() {
      var requestStub = null;
      var handleResponseStub = sinon.stub();

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: handleResponseStub});

      var sampleRequestForRetry = null;

      function givenPutReturnsError() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns(Promise.reject({errorCode: 4001}));
      }

      function givenPutReturnsSuccess() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns({content: true});
      }

      function givenEarlyExitBackoff() {
        sampleRequestForRetry.calcRetryBackoff = numRetry => numRetry == 1 ? -1 : 1;
      }

      function givenBackoffDependsOnError() {
        sampleRequestForRetry.calcRetryBackoff = (numRetry, error) => {
          if(error.errorCode == 4001) return numRetry == 1 ? -1 : 1;
          else throw new Error('Error object not provided to backoff');
        };
      }

      beforeEach(() => {
        requestStub = sinon.stub(request, 'putAsync');

        sampleRequestForRetry = _.extend({}, sampleRequest);
        sampleRequestForRetry.maxRetryDurationMillis = 30;
        sampleRequestForRetry.calcRetryBackoff = function (numRetry) {return Math.pow(3, numRetry);};
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('put called once on success', () => {
        givenPutReturnsSuccess();
        return stubbedRequestor
          .put(sampleRequestForRetry)
          .then(data => requestStub.callCount.should.equal(1));
      });

      it('put retried on error', () => {
        givenPutReturnsError();
        return stubbedRequestor
          .put(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.be.above(1));
      });

      it('put stops retrying when receiving a negative backoff', () => {
        givenPutReturnsError();
        givenEarlyExitBackoff();
        return stubbedRequestor
          .put(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });

      it('put passes the causing error to the backoff function', () => {
        givenPutReturnsError();
        givenBackoffDependsOnError();
        return stubbedRequestor
          .put(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });
    });
  });

  describe('#DELETE', function() {
    describe('#Successful request', function() {
      var requestStub = null;

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'delAsync');
        var mockResponse = {
          statusCode: 200,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        var mockBody = '{"hello":"world"}';
        requestStub.returns(Promise.resolve([mockResponse, mockBody]));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should resolve as true', () =>
        stubbedRequestor
          .delete(sampleRequest)
          .then(data => data.should.be.true));

      it('request should call callback as true', (done) => {
        stubbedRequestor
          .delete(sampleRequest,
                  (err, data) => {
                    data.should.be.true;
                    done();
                  });
      });
    });

    describe('#Error on request', function() {
      var requestStub = null;
      var handleResponseStub = null;
      var mockBody = {error: true};

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: () => ({content: true})});

      beforeEach(() => {
        requestStub = sinon.stub(request, 'delAsync');
        var mockResponse = {
          statusCode: 403,
          headers: {
            'content-type':'application/json;charset=UTF-8'
          }
        };
        requestStub.returns(Promise.reject(mockBody));
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('request should error as false', () =>
        stubbedRequestor
          .delete(sampleRequest)
          .catch(error => error.error.should.be.true));

      it('request should error as false', (done) => {
        stubbedRequestor
          .delete(sampleRequest,
                  (err, data) => {
                    err.should.eql(mockBody);
                    done();
                  });
      });
    });

    describe('#Arguments', function() {
      var spyPut;

      beforeEach(() => {
        spyPut = sinon.spy(request, 'delAsync');
      });

      afterEach(() => {
        spyPut.restore();
      });

      it('headers sent as part of request should match given', () => {
        var sampleHeaders = {
          Authorization: 'Bearer TOKEN',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `smartsheet-javascript-sdk/${EXPECTED_VERSION}`
        };
        requestor.delete(sampleRequest);
        spyPut.args[0][0].headers.Authorization.should.equal(sampleHeaders.Authorization);
        spyPut.args[0][0].headers.Accept.should.equal(sampleHeaders.Accept);
        spyPut.args[0][0].headers['Content-Type'].should.equal(sampleHeaders['Content-Type']);
        spyPut.args[0][0].headers['User-Agent'].should.equal(sampleHeaders['User-Agent']);
      });

      it('url sent to request should match given', () => {
        requestor.delete(sampleRequest);
        spyPut.args[0][0].url.should.equal('https://api.smartsheet.com/2.0/URL');
      });

      it('queryString sent to request should match given', () => {
        requestor.delete(sampleRequestWithQueryParameters);
        spyPut.args[0][0].qs.should.equal(sampleRequestWithQueryParameters.queryParameters);
      });
    });

    describe('#Retry', function() {
      var requestStub = null;
      var handleResponseStub = sinon.stub();

      var stubbedRequestor = require('../../lib/utils/httpRequestor')
        .create({request: request, handleResponse: handleResponseStub});

      var sampleRequestForRetry;

      function givenDeleteReturnsError() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns(Promise.reject({errorCode: 4001}));
      }

      function givenDeleteReturnsSuccess() {
        requestStub.returns(Promise.resolve([{}, {}]));
        handleResponseStub.returns({content: true});
      }

      function givenEarlyExitBackoff() {
        sampleRequestForRetry.calcRetryBackoff = numRetry => numRetry == 1 ? -1 : 1;
      }

      function givenBackoffDependsOnError() {
        sampleRequestForRetry.calcRetryBackoff = (numRetry, error) => {
          if(error.errorCode == 4001) return numRetry == 1 ? -1 : 1;
          else throw new Error('Error object not provided to backoff');
        };
      }

      beforeEach(() => {
        requestStub = sinon.stub(request, 'delAsync');

        sampleRequestForRetry = _.extend({}, sampleRequest);
        sampleRequestForRetry.maxRetryDurationMillis = 30;
        sampleRequestForRetry.calcRetryBackoff = function (numRetry) {return Math.pow(3, numRetry);};
      });

      afterEach(() => {
        requestStub.restore();
      });

      it('delete called once on success', () => {
        givenDeleteReturnsSuccess();
        return stubbedRequestor
          .delete(sampleRequestForRetry)
          .then(data => requestStub.callCount.should.equal(1));
      });

      it('delete retried on error', () => {
        givenDeleteReturnsError();
        return stubbedRequestor
          .delete(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.be.above(1));
      });

      it('delete stops retrying when receiving a negative backoff', () => {
        givenDeleteReturnsError();
        givenEarlyExitBackoff();
        return stubbedRequestor
          .delete(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });

      it('delete passes the causing error to the backoff function', () => {
        givenDeleteReturnsError();
        givenBackoffDependsOnError();
        return stubbedRequestor
          .delete(sampleRequestForRetry)
          .catch(err => requestStub.callCount.should.equal(2));
      });
    });
  });

  describe.only('#RequestLogger', function() {
    var requestLogger;
    var loggerFakes;
    var clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
      loggerFakes = {
        log: sinon.fake(),
        debug: sinon.fake(),
        verbose: sinon.fake(),
        silly: sinon.fake(),
        info: sinon.fake(),
        warn: sinon.fake(),
        error: sinon.fake(),
        filters: [],
      };
      requestLogger = createRequestLogger(loggerFakes);
    });

    afterEach(() => {
      clock.restore();
    });

    describe('#log', function() {
      it('should call log on the injected logger', () => {
        requestLogger.log("info", "An info message");
        loggerFakes.log.args[0].should.deepEqual(["info", "An info message"]);
      });
    });

    function createRequest(opts) {
      opts = opts ? opts : {};
      return {
        verb: opts.verb ? opts.verb : "GET",
        requestOptions: {
          url: opts.url ? opts.url : smartSheetURIs.defaultBaseURI,
          qs: opts.qs ? opts.qs : {},
          headers: opts.headers ? opts.headers : {},
          body: opts.body ? opts.body :  "",
        },
      };
    }

    function createResponse(opts) {
      opts = opts ? opts : {};
      return {
        statusCode: opts.statusCode ? opts.statusCode : 200,
        headers: opts.headers ? opts.headers : {},
        content: opts.content ? opts.content : {},
      };
    }

    describe('#logRequest', function() {
      [
        smartSheetURIs.defaultBaseURI,
        smartSheetURIs.govBaseURI
      ].forEach(url => {
        it('should info log the request url and query params', () => {
          var request = createRequest({
            url,
            qs: {
              queryKey: "queryVal",
              "key that has spaces": "value that has spaces",
            }
          });
          requestLogger.logRequest(request.verb, request.requestOptions);
          loggerFakes.log.args[0].should.deepEqual(['info', '%s %s', request.verb, `${url}?queryKey=queryVal&key%20that%20has%20spaces=value%20that%20has%20spaces`]);
        });
      });

      it('should not silly log any request headers when none are present', () => {
        var request = createRequest({
          headers: {}
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.silly.callCount.should.equal(0);
      });

      it('should silly log the request headers when present', () => {
        var request = createRequest({
          headers: {someHeader: "someHeaderValue", anotherHeader: 123}
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Request', '{"someHeader":"someHeaderValue","anotherHeader":123}']);
      });

      it('should censor the authorization request header', () => {
        var request = createRequest({
          headers: {authorization: "SuperSecret"}
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        // The censor logic leaves the last 4 characters uncensored
        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Request', '{"authorization":"*******cret"}']);
      });

      it('should not censor an empty authorization request header', () => {
        var request = createRequest({
          headers: {authorization: ""}
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Request', '{"authorization":""}']);
      });

      it('should not debug nor verbose log any payload if none exists on the request', () => {
        var request = createRequest({
          body: '',
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.debug.callCount.should.equal(0);
        loggerFakes.verbose.callCount.should.equal(0);
      });

      it('should debug log the full request payload', () => {
        var request = createRequest({
          body: 'This is the request payload!',
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.debug.args[0].should.deepEqual(['%s Payload (full): %s', 'Request', 'This is the request payload!']);
      });

      it('should verbose log the full request payload if it does not exceed 1024 characters', () => {
        var shortPayload = Array(1024).fill("0").join("");
        
        var request = createRequest({
          body: shortPayload,
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.verbose.args[0].should.deepEqual(['%s Payload (preview): %s', 'Request', shortPayload]);
      });

      it('should verbose log a truncated request payload if it exceeds 1024 characters', () => {
        var longPayload = Array(2048).fill("0").join("");
        
        var request = createRequest({
          body: longPayload,
        });

        requestLogger.logRequest(request.verb, request.requestOptions);

        loggerFakes.verbose.args[0][0].should.equal('%s Payload (preview): %s');
        loggerFakes.verbose.args[0][1].should.equal('Request');
        var preview = loggerFakes.verbose.args[0][2];
        preview.endsWith('...').should.equal(true);
        preview.length.should.equal(1024 + '...'.length);
      });
    });

    describe('#logRetryAttempt', function () {
      [
        smartSheetURIs.defaultBaseURI,
        smartSheetURIs.govBaseURI
      ].forEach(url => {
        it('should warn log the attempt and request url and query params', () => {
          var request = createRequest({
            url,
            qs: {
              queryKey: "queryVal",
              "key that has spaces": "value that has spaces",
            }
          });
          var error = "some error";
          var attemptNum = 3;

          requestLogger.logRetryAttempt(request.verb, request.requestOptions, error, attemptNum);

          loggerFakes.warn.args[0].should.deepEqual(['Request failed, performing retry #%d\nCause: ', attemptNum, error]);
          loggerFakes.log.args[0].should.deepEqual(['warn', '%s %s', request.verb, `${url}?queryKey=queryVal&key%20that%20has%20spaces=value%20that%20has%20spaces`]);
        });
      });
    });

    describe('#logRetryFailure', function() {
      it('should error log the failure and attempt number', () => {
        var request = createRequest();
        var attemptNum = 3;

        requestLogger.logRetryFailure(request.verb, request.requestOptions, attemptNum);

        loggerFakes.error.args[0].should.deepEqual(['Request failed after %d retries', attemptNum]);
      });
    });

    describe('#logSuccessfulResponse', function() {
      it('should info log the success and response status code', () => {
        var response = createResponse({
          statusCode: 201,
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.info.args[0].should.deepEqual(['Response: Success (HTTP %d)', 201]);
      });

      it('should not silly log any response headers when none are present', () => {
        var response = createResponse({
          headers: {}
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.silly.callCount.should.equal(0);
      });

      it('should silly log the response headers when present', () => {
        var response = createResponse({
          headers: {someHeader: "someHeaderValue", anotherHeader: 123}
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"someHeader":"someHeaderValue","anotherHeader":123}']);
      });

      it('should censor the authorization response header', () => {
        var response = createResponse({
          headers: {authorization: "SuperSecret"}
        });

        requestLogger.logSuccessfulResponse(response);

        // The censor logic leaves the last 4 characters uncensored
        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"authorization":"*******cret"}']);
      });

      it('should not censor an empty authorization response header', () => {
        var response = createResponse({
          headers: {authorization: ""}
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"authorization":""}']);
      });

      it('should not log an empty response payload', () => {
        var response = createResponse({
          content: {},
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.verbose.callCount.should.equal(0);
        loggerFakes.debug.callCount.should.equal(0);
      });

      it('should debug log the full response payload', () => {
        var response = createResponse({
          content: {body: 'This is the request payload!'},
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.debug.args[0].should.deepEqual(['%s Payload (full): %s', 'Response', '{"body":"This is the request payload!"}']);
      });

      it('should verbose log the full response payload if it does not exceed 1024 characters', () => {
        var shortPayload = Array(512).fill("0").join("");
        
        var response = createResponse({
          content: {body: shortPayload},
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.verbose.args[0].should.deepEqual(['%s Payload (preview): %s', 'Response', `{"body":"${shortPayload}"}`]);
      });

      it('should verbose log a truncated response payload if it exceeds 1024 characters', () => {
        var longPayload = Array(1024).fill("0").join("");
        
        var response = createResponse({
          content: {body: longPayload},
        });

        requestLogger.logSuccessfulResponse(response);

        loggerFakes.verbose.args[0][0].should.equal('%s Payload (preview): %s');
        loggerFakes.verbose.args[0][1].should.equal('Response');
        var preview = loggerFakes.verbose.args[0][2];
        preview.endsWith('...').should.equal(true);
        preview.length.should.equal(1024 + '...'.length);
      });
      
      [
        'access_token',
        'refresh_token',
      ].forEach(token => {
        it(`should censor the ${token} token on the response payload`, () => {
          var response = createResponse({
            content: {[token]: 'SuperSecret'},
          });

          requestLogger.logSuccessfulResponse(response);

          // The censor logic leaves the last 4 characters uncensored
          loggerFakes.verbose.args[0].should.deepEqual(['%s Payload (preview): %s', 'Response', `{"${token}":"*******cret"}`]);
        });
      });
    });

    describe('#logErrorResponse', function() {
      [
        smartSheetURIs.defaultBaseURI,
        smartSheetURIs.govBaseURI
      ].forEach(url => {
        it('should error log the request url and query params and the error response', () => {
          var request = createRequest({
            url,
            qs: {
              queryKey: "queryVal",
              "key that has spaces": "value that has spaces",
            }
          });
          var error = {
            statusCode: 500,
            errorCode: 4001,
            message: 'An error message',
            refId: 123,
          };

          requestLogger.logErrorResponse(request.verb, request.requestOptions, error);

          loggerFakes.log.args[0].should.deepEqual(['error', '%s %s', request.verb, `${url}?queryKey=queryVal&key%20that%20has%20spaces=value%20that%20has%20spaces`]);
          loggerFakes.error.args[0].should.deepEqual(['Response: Failure (HTTP %d)\n\tError Code: %d - %s\n\tRef ID: %s', 500, 100, 'An error message', 123]);
        });
      });

      it('should not silly log any response headers when none are present', () => {
        var request = createRequest({
          qs: {
            queryKey: "queryVal",
            "key that has spaces": "value that has spaces",
          }
        });
        var error = {
          statusCode: 500,
          errorCode: 4001,
          message: 'An error message',
          refId: 123,
          headers: {},
        };

        requestLogger.logErrorResponse(request.verb, request.requestOptions, error);

        loggerFakes.silly.callCount.should.equal(0);
      });

      it('should silly log the response headers when present', () => {
        var request = createRequest({
          qs: {
            queryKey: "queryVal",
            "key that has spaces": "value that has spaces",
          }
        });
        var error = {
          statusCode: 500,
          errorCode: 4001,
          message: 'An error message',
          refId: 123,
          headers: {someHeader: "someHeaderValue", anotherHeader: 123}
        };

        requestLogger.logErrorResponse(request.verb, request.requestOptions, error);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"someHeader":"someHeaderValue","anotherHeader":123}']);
      });

      it('should censor the authorization response header', () => {
        var request = createRequest({
          qs: {
            queryKey: "queryVal",
            "key that has spaces": "value that has spaces",
          }
        });
        var error = {
          statusCode: 500,
          errorCode: 4001,
          message: 'An error message',
          refId: 123,
          headers: {authorization: "SuperSecret"}
        };

        requestLogger.logErrorResponse(request.verb, request.requestOptions, error);

        // The censor logic leaves the last 4 characters uncensored
        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"authorization":"*******cret"}']);
      });

      it('should not censor an empty authorization response header', () => {
        var request = createRequest({
          qs: {
            queryKey: "queryVal",
            "key that has spaces": "value that has spaces",
          }
        });
        var error = {
          statusCode: 500,
          errorCode: 4001,
          message: 'An error message',
          refId: 123,
          headers: {authorization: ""}
        };

        requestLogger.logErrorResponse(request.verb, request.requestOptions, error);

        loggerFakes.silly.args[0].should.deepEqual(['%s Headers: %s', 'Response', '{"authorization":""}']);
      });
    });

    [
      '',
      'silly',
      'debug',
      'info',
      'warn',
      'error',
      'SuperDuperError'
    ].forEach(level => {
      it('should add formatLog to logger.filters', () => {
        loggerFakes.filters.length.should.equal(1);
  
        var formatLog = loggerFakes.filters[0];
        var fakeDateTime = new Date(0).toISOString();
        var levelDisplay = level.toUpperCase().padStart(7);
  
        formatLog(level, 'message').should.equal(`${fakeDateTime}[${levelDisplay}] message`);
      });
    });
  });
});
