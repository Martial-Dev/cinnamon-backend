const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');

const ceylonProducts = [
  {
    productName: "Alba Cinnamon Sticks",
    productDescription: "The finest grade of Ceylon Cinnamon. Ultra-thin bark with a delicate, sweet flavor. Perfect for luxury gifts and gourmet cooking. Hand-rolled by expert craftsmen in Sri Lanka.",
    productImage: "https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=400",
    quantity: 100,
    price: 24.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "C5 Special Cinnamon Sticks",
    productDescription: "High-quality Ceylon Cinnamon sticks. Ideal for baking, beverages, and everyday culinary use. Rich aroma and smooth taste profile.",
    productImage: "https://images.unsplash.com/photo-1599987983948-d0fcb8f2c964?w=400",
    quantity: 150,
    price: 18.99,
    availability: "In Stock",
    type: "standard",
    discount: 10
  },
  {
    productName: "C4 Cinnamon Sticks",
    productDescription: "Popular grade for home cooking. Rich flavor perfect for curries, desserts, and hot drinks. The most versatile Ceylon cinnamon option.",
    productImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    quantity: 200,
    price: 14.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "Ceylon Cinnamon Powder",
    productDescription: "Freshly ground pure Ceylon Cinnamon. No additives or preservatives. Perfect for smoothies, baking, coffee, and health supplements. Low coumarin content.",
    productImage: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400",
    quantity: 250,
    price: 12.99,
    availability: "In Stock",
    type: "standard",
    discount: 5
  },
  {
    productName: "Cinnamon Bark Oil - Pure Extract",
    productDescription: "100% pure Ceylon Cinnamon essential oil. Steam distilled from premium cinnamon bark. For aromatherapy, massage, and wellness applications.",
    productImage: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400",
    quantity: 75,
    price: 29.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "Wholesale Alba Grade - 1kg",
    productDescription: "Bulk Alba grade cinnamon for businesses and wholesale buyers. Premium quality at wholesale prices. Perfect for restaurants, bakeries, and resellers.",
    productImage: "https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=400",
    quantity: 50,
    price: 189.99,
    availability: "In Stock",
    type: "bulk",
    discount: 15
  },
  {
    productName: "Wholesale C5 Special - 1kg",
    productDescription: "Bulk C5 Special grade for restaurants, bakeries, and food manufacturers. Consistent quality and flavor in every batch.",
    productImage: "https://images.unsplash.com/photo-1599987983948-d0fcb8f2c964?w=400",
    quantity: 80,
    price: 149.99,
    availability: "In Stock",
    type: "bulk",
    discount: 10
  },
  {
    productName: "Cinnamon Gift Box",
    productDescription: "Luxury gift set featuring Alba sticks, premium powder, and cinnamon bark oil. Beautifully packaged in traditional Sri Lankan style. Perfect for holidays and special occasions.",
    productImage: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400",
    quantity: 30,
    price: 49.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "H1 Cinnamon Sticks",
    productDescription: "Hand-selected H1 grade cinnamon. Thicker quills with robust flavor, ideal for slow cooking and simmering in stews and curries.",
    productImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    quantity: 180,
    price: 11.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "Ceylon Cinnamon Tea - 20 Bags",
    productDescription: "Pure Ceylon Cinnamon tea. 20 individually wrapped bags. Caffeine-free and packed with antioxidants. Helps support healthy blood sugar levels.",
    productImage: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400",
    quantity: 120,
    price: 9.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "Organic Ceylon Cinnamon Sticks",
    productDescription: "USDA Certified Organic Ceylon Cinnamon. Grown without pesticides or chemicals. Perfect for health-conscious consumers who demand the purest ingredients.",
    productImage: "https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=400",
    quantity: 60,
    price: 32.99,
    availability: "In Stock",
    type: "standard",
    discount: 0
  },
  {
    productName: "Cinnamon Chips & Quillings",
    productDescription: "Broken cinnamon pieces perfect for brewing tea, making potpourri, or adding to mulled wine. Great value for everyday use.",
    productImage: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400",
    quantity: 200,
    price: 8.99,
    availability: "In Stock",
    type: "standard",
    discount: 20
  }
];

async function seedDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/canela-ceylon';
    console.log('Connecting to MongoDB:', mongoUri);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing products
    await Product.deleteMany({});
    console.log('🗑️  Cleared existing products');

    // Insert new products
    const inserted = await Product.insertMany(ceylonProducts);
    console.log(`\n✅ Added ${inserted.length} products to database:\n`);

    // List products
    inserted.forEach((p, i) => {
      const discountStr = p.discount > 0 ? ` (${p.discount}% off)` : '';
      console.log(`  ${i + 1}. ${p.productName} - $${p.price}${discountStr}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database seeded successfully!');
    console.log('🌐 Refresh http://localhost:4200 to see the products');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
