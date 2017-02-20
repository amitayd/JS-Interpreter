  function AsyncInterpreterRunner(code, initCallback) {
  this.initCallback = initCallback;
  this.interpreter = new Interpreter(code, this.initInterpreter.bind(this));
}


AsyncInterpreterRunner.prototype.initInterpreter = function (interpreter, scope) {
  var helper = new NativeHelper(interpreter);
  this.helper = helper;

  this.asyncWait = interpreter.createObject(interpreter.OBJECT);
  // TODO: Kind of hacky
  this.asyncWait.customArgumentNativeConversion =
    this.convertAsyncToNativeCallback.bind(this);
  this.asyncResult = interpreter.createObject(interpreter.OBJECT);
  interpreter.setProperty(scope, 'asyncResult', this.asyncResult);
  interpreter.setProperty(scope, 'asyncWait', this.asyncWait);

  if (this.initCallback) {
    this.initCallback(interpreter, scope, helper);
  }
};


AsyncInterpreterRunner.prototype.convertAsyncToNativeCallback = function () {
  var that = this;
  var helper = this.helper;
  that.waiting = true;
  return function (error, result) {
    var interpreterResult = helper.nativeValueToInterpreter({
      error: error,
      result: result
    });
    helper.interpreter.setProperty(that.asyncResult, 'error',
      helper.nativeValueToInterpreter(error));
    helper.interpreter.setProperty(that.asyncResult, 'result',
      helper.nativeValueToInterpreter(result));
    that.waiting = false;
  };
};

AsyncInterpreterRunner.prototype.run = function (doneCallback) {
  var that = this;

  function nextStep() {
    if (that.waiting) {
      window.setTimeout(nextStep, 0);
    } else if (that.interpreter.step()) {
      //window.setTimeout(nextStep, 0);
      nextStep();
    } else {
      if (doneCallback) {
        doneCallback();
      }
    }
  }
  nextStep();
};

AsyncInterpreterRunner.prototype.step = function () {
  if (this.waiting) {
    return true;
  } else if (this.interpreter.step()) {
    return true;
  } else {
    return false;
  }
};


function AsyncScheduler() {
  this.settings = {
    timePerProcessMS: 2,
    jobDelay: 0
  };

  this.queue = [];
}

AsyncScheduler.prototype.submit = function (runner, jobName) {
  jobName = jobName || 'job' + Math.rand();
  this.queue.push({
    runner: runner,
    name: jobName
  });
};

AsyncScheduler.prototype.run = function(doneCallback) {
  this._doWork(doneCallback);
};

AsyncScheduler.prototype._doWork = function (doneCallback) {
  var job = this.queue.shift();
  if (!job) {
    doneCallback();
    return;
  }
  var startTime = new Date();

  while (true) {
    var quotaExceeded = (new Date() - startTime) > this.settings.timePerProcessMS;
    if (quotaExceeded || job.runner.waiting) {
      this.submit(job.runner, job.name);
      break;
    }

    if (!job.runner.step()) {
      break;
    }
  }

  // Reschedule
  window.setTimeout(this._doWork.bind(this, doneCallback), this.settings.jobDelay);
};