import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { strings } from '../src/i18n/strings';

test('an unpaired terminal shows the pairing screen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const texts = () =>
    renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children);

  // The encrypted store loads asynchronously before the first real screen.
  for (let i = 0; i < 50 && !texts().includes(strings.pairing.title); i++) {
    await ReactTestRenderer.act(
      () => new Promise(resolve => setTimeout(resolve, 10)),
    );
  }
  expect(texts()).toContain(strings.pairing.title);
  // The first render transforms the whole app; slow on a cold cache.
}, 20_000);
