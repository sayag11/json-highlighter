module.exports = {
	testEnvironment: 'jsdom',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
	testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/src/**/*.test.jsx'],
	collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
	coverageThreshold: {
		global: {
			branches: 85,
			functions: 90,
			lines: 90,
			statements: 90,
		},
	},
};
