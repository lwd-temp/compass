'use strict';

require('../helper');

const expect = require('chai').expect;
const React = require('react');
const ReactTestUtils = require('react-addons-test-utils');

const FormSelect = require('../../lib/component/form-select');

describe('FormSelect', function() {
  describe('#render', function() {
    var renderer = ReactTestUtils.createRenderer();
    renderer.render(React.createElement(FormSelect));
    var output = renderer.getRenderOutput();

    it('returns the form select input', function() {
      expect(output.type).to.equal('select');
    });

    it('sets the class name', function() {
      expect(output.props.className).to.equal('form-control');
    });

    it('has a displayName', function() {
      expect(FormSelect.displayName).to.equal('FormSelect');
    });
  });
});
