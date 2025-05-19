# Project Title: Backend for E-commerce Application using MongoDB

## Description
This project is a backend application for an e-commerce platform built using Node.js and Express. It utilizes MongoDB as the database to store and manage data related to users, products, carts, invoices, and reviews.

## Features
- User authentication and management
- Product management (CRUD operations)
- Cart management (add, retrieve, delete items)
- Invoice management (create, retrieve, update invoices)
- Image upload and retrieval
- Middleware for authentication checks

## Technologies Used
- Node.js
- Express.js
- MongoDB
- Mongoose (for MongoDB object modeling)
- Multer (for handling file uploads)
- dotenv (for environment variable management)

## Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd backend-mongodb
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Create a `.env` file in the root directory and add your MongoDB connection string:
   ```
   MONGODB_URI=mongodb+srv://canelaceylonbycinnamoninc:LHAW0YHWTOzpKtRS@canleaceylon.czljmki.mongodb.net/
   ```

## Usage
1. Start the server:
   ```
   npm start
   ```
2. The server will run on `http://localhost:8080`.

## API Endpoints
- **Users**
  - `POST /api/users` - Create a new user
  - `GET /api/users/:id` - Retrieve user information
  - `PUT /api/users/:id` - Update user details

- **Products**
  - `POST /api/products` - Create a new product
  - `GET /api/products` - Retrieve all products
  - `GET /api/products/:id` - Retrieve a specific product
  - `PUT /api/products/:id` - Update a product
  - `DELETE /api/products/:id` - Delete a product

- **Cart**
  - `POST /api/cart` - Add item to cart
  - `GET /api/cart` - Retrieve cart items
  - `DELETE /api/cart/:id` - Remove item from cart

- **Invoices**
  - `POST /api/invoice` - Create a new invoice
  - `GET /api/invoice/:id` - Retrieve an invoice
  - `PUT /api/invoice/:id` - Update an invoice

- **Images**
  - `POST /uploads` - Upload an image
  - `GET /uploads/:filename` - Retrieve an image

- **Login**
  - `POST /api/login` - Authenticate user and generate token

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License
This project is licensed under the MIT License.