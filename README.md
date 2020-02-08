# Emyto Token Escrow

## Running the tests

This project uses Truffle for tests. Truffle's version of `solc` needs to be at least 0.5.11 for the contracts to compile.
Open your console and run:

    $ git clone git@github.com:rotcivegaf/emyto-token-escrow.git
    $ cd emyto-token-escrow
    $ npm install

Now in one console, open the ganache-cli:

    $ ./node_modules/.bin/ganache-cli

And in other console(in the same folder), run the tests with truffle:

    $ ./node_modules/.bin/truffle test

## Authors

* **Victor Fage** - *Initial work* - [rotcivegaf](https://github.com/rotcivegaf)
