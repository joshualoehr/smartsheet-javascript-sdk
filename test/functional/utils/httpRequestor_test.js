var _ = require('underscore');
var Promise = require('bluebird');
var should = require('should');
var sinon = require('sinon');
var packageJson = require('../../../package.json');
var httpRequestor = require('../../../lib/utils/httpRequestor');
var responseHandler = require('../../../lib/utils/responseHandler');
var requestLogger = require('../../../lib/utils/requestLogger');
var fs = require('fs');

describe("httpRequest", () => {
  var handleResponse;
  var logger;

  beforeEach(() => {
    handleResponse = sinon.spy(responseHandler);
    logger = {
      logRequest: sinon.stub(),
      logRetryAttempt: sinon.stub(),
      logRetryFailure: sinon.stub(),
      logSuccessfulResponse: sinon.stub(),
      logErrorResponse: sinon.stub(),
      log: sinon.stub(),
    };
    sinon.stub(requestLogger, 'create').returns(logger);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("#get", () => {
    it("should make and handle a successful GET request", (done) => {
      var successResponse = {
        error: undefined,
        response: { statusCode: 200, headers: {} },
        body: 'response body',
      };

      var get = sinon.stub().callsFake((opts, callback) => {
        callback(successResponse.error, successResponse.response, successResponse.body);
      });

      var httpRequestObject = httpRequestor.create({
        logger: {},
        request: Promise.promisifyAll({ get }, { multiArgs: true }),
        handleResponse,
      });

      var options = {
        baseUrl: 'http://test.com/',
        url: "path/to/endpoint",
        queryParameters: { key: 'value', 'other key': 123 },
        encoding: 'some_encoding',
      };

      httpRequestObject.get(options, (error, content) => {
        should(error).be.null();
        should(content).equal(successResponse.body);

        // Options object that should be passed into the 'request' module's get method
        var expectedRequestOptions = {
          url: 'http://test.com/path/to/endpoint',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `smartsheet-javascript-sdk/${packageJson.version}`,
          },
          qs: { key: 'value', 'other key': 123 },
          encoding: 'some_encoding',
          gzip: true,
        };

        sinon.assert.calledOnceWithMatch(get, expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(logger.logRequest, "GET", expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(handleResponse, successResponse.response, successResponse.body);
        sinon.assert.calledOnceWithMatch(logger.logSuccessfulResponse, successResponse.response);

        done();
      });
    });

    it("should make and handle an unsuccessful GET request", (done) => {
      var errorResponse = {
        error: undefined,
        response: { statusCode: 500, headers: {} },
        body: 'error message',
      };

      var get = sinon.stub().callsFake((opts, callback) => {
        callback(errorResponse.error, errorResponse.response, errorResponse.body);
      });

      var httpRequestObject = httpRequestor.create({
        logger: {},
        request: Promise.promisifyAll({ get }, { multiArgs: true }),
        handleResponse,
      });

      var options = {
        baseUrl: 'http://test.com/',
        url: "path/to/endpoint",
        queryParameters: { key: 'value', 'other key': 123 },
        encoding: 'some_encoding',
      };

      httpRequestObject.get(options, (error, content) => {
        should.exist(error);
        should(content).be.undefined();

        // Options object that should be passed into the 'request' module's get method
        var expectedRequestOptions = {
          url: 'http://test.com/path/to/endpoint',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `smartsheet-javascript-sdk/${packageJson.version}`,
          },
          qs: { key: 'value', 'other key': 123 },
          encoding: 'some_encoding',
          gzip: true,
        };

        sinon.assert.calledOnceWithMatch(get, expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(logger.logRequest, "GET", expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(handleResponse, errorResponse.response, errorResponse.body);
        sinon.assert.calledOnceWithMatch(logger.logErrorResponse, "GET", expectedRequestOptions, {
          ...errorResponse.response,
          body: errorResponse.body,
        });

        done();
      });
    });
  });

  describe("#post", () => {
    it("should make and handle a successful POST request with a file", (done) => {
      var successResponse = {
        error: undefined,
        response: { statusCode: 200, headers: {} },
        body: 'response body',
      };

      var post = sinon.stub().callsFake((opts, callback) => {
        callback(successResponse.error, successResponse.response, successResponse.body);
      });

      var createReadStreamStub = sinon.stub(fs, 'createReadStream').returns('file body');
      var statSyncStub = sinon.stub(fs, 'statSync').returns({ size: 1234 });

      var httpRequestObject = httpRequestor.create({
        logger: {},
        request: Promise.promisifyAll({ post }, { multiArgs: true }),
        handleResponse,
      });

      var options = {
        baseUrl: 'http://test.com/',
        url: "path/to/endpoint",
        queryParameters: { key: 'value', 'other key': 123 },
        encoding: 'some_encoding',
        path: 'path/to/file',
      };

      httpRequestObject.postFile(options, (error, content) => {
        should(error).be.null();
        should(content).equal(successResponse.body);

        // Options object that should be passed into the 'request' module's post method
        var expectedRequestOptions = {
          url: 'http://test.com/path/to/endpoint',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `smartsheet-javascript-sdk/${packageJson.version}`,
            'Content-Length': 1234,
          },
          qs: { key: 'value', 'other key': 123 },
          encoding: 'some_encoding',
          gzip: true,
          body: 'file body',
        };

        sinon.assert.calledOnceWithMatch(createReadStreamStub, options.path);
        sinon.assert.calledOnceWithMatch(statSyncStub, options.path);
        sinon.assert.calledOnceWithMatch(post, expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(logger.logRequest, "POST", expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(handleResponse, successResponse.response, successResponse.body);
        sinon.assert.calledOnceWithMatch(logger.logSuccessfulResponse, successResponse.response);

        createReadStreamStub.restore();
        statSyncStub.restore();
        done();
      });
    });

    it("should make and handle an unsuccessful POST request with a file", (done) => {
      var errorResponse = {
        error: undefined,
        response: { statusCode: 500, headers: {} },
        body: 'error message',
      };

      var post = sinon.stub().callsFake((opts, callback) => {
        callback(errorResponse.error, errorResponse.response, errorResponse.body);
      });

      var httpRequestObject = httpRequestor.create({
        logger: {},
        request: Promise.promisifyAll({ post }, { multiArgs: true }),
        handleResponse,
      });

      var options = {
        baseUrl: 'http://test.com/',
        url: "path/to/endpoint",
        queryParameters: { key: 'value', 'other key': 123 },
        encoding: 'some_encoding',
        fileStream: 'file body',
      };

      httpRequestObject.postFile(options, (error, content) => {
        should.exist(error);
        should(content).be.undefined();

        // Options object that should be passed into the 'request' module's post method
        var expectedRequestOptions = {
          url: 'http://test.com/path/to/endpoint',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `smartsheet-javascript-sdk/${packageJson.version}`,
          },
          qs: { key: 'value', 'other key': 123 },
          encoding: 'some_encoding',
          gzip: true,
          body: 'file body',
        };

        sinon.assert.calledOnceWithMatch(post, expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(logger.logRequest, "POST", expectedRequestOptions);
        sinon.assert.calledOnceWithMatch(handleResponse, errorResponse.response, errorResponse.body);
        sinon.assert.calledOnceWithMatch(logger.logErrorResponse, "POST", expectedRequestOptions, {
          ...errorResponse.response,
          body: errorResponse.body,
        });

        done();
      });
    });
  });
});
