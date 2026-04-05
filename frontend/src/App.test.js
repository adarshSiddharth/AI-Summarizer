import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

test('renders AI Summarizer hero content', () => {
  render(<App />);
  expect(screen.getByText(/AI Summarizer/i)).toBeInTheDocument();
  expect(screen.getByText(/Generate summary/i)).toBeInTheDocument();
});
