const express = require("express");
const router = express.Router();

// Knowledge base for Ceylon cinnamon
const knowledgeBase = {
  ceylon: `Ceylon cinnamon (Cinnamomum verum) is the "true cinnamon" native to Sri Lanka. It's known for its delicate, sweet flavor and low coumarin content, making it the healthier choice compared to Cassia cinnamon.`,
  
  grades: `We offer premium Ceylon cinnamon products:

• **Alba Cinnamon** - The finest grade with ultra-thin bark – 942 LKR
• **Ceylon Cinnamon Alba – Custom Bulk Orders (1kg+)** - Premium bulk option – 7,800 LKR
• **Ceylon Cinnamon C5 Special – Custom Bulk Orders** - High-quality bulk sticks – 6,000 LKR
• **Cinnamon Alba Heritage Tokens** - Unique heritage gift tokens – 1,850 LKR

All prices are in Sri Lankan Rupees (LKR). Contact us for international pricing!`,
  
  health: `Ceylon cinnamon offers numerous health benefits:

• Helps regulate blood sugar levels
• Rich in antioxidants
• Anti-inflammatory properties
• Supports heart health
• Low in coumarin (safe for daily use)
• May improve brain function
• Supports digestive health`,
  
  shipping: `We ship worldwide from Sri Lanka!

• **Domestic (Sri Lanka)**: 2-3 business days
• **International**: 7-14 business days
• Free shipping on orders over $50
• All orders include tracking
• Secure packaging to preserve freshness
• Express shipping available`,
  
  wholesale: `We offer wholesale pricing for businesses:

• Minimum order: 5kg
• Bulk discounts up to 25%
• Custom packaging available
• Dedicated account manager
• Quality certificates provided
• Contact: wholesale@canelaceylon.com`,
  
  difference: `Ceylon vs Cassia Cinnamon:

**Ceylon (True Cinnamon)**:
• Light brown, delicate layers
• Sweet, subtle flavor with citrus notes
• Very low coumarin (safe for daily use)
• More expensive, premium quality
• Native to Sri Lanka

**Cassia (Common Cinnamon)**:
• Dark brown, thick bark
• Strong, spicy flavor
• High coumarin (limit intake)
• Cheaper, widely available
• Mostly from China/Indonesia`,

  storage: `To keep your cinnamon fresh:

• Store in an airtight container
• Keep in a cool, dark place
• Avoid humidity and heat
• Sticks last 2-3 years
• Powder best within 6 months
• Refrigeration not needed
• Keep away from direct sunlight`,

  recipes: `Popular ways to use Ceylon cinnamon:

• Morning coffee or tea (add 1/4 tsp)
• Smoothies and oatmeal
• Baking (cookies, cakes, pastries)
• Curries and savory dishes
• Mulled wine and apple cider
• Honey cinnamon spread
• Rice pudding and desserts
• Cinnamon water (health drink)

Check our Recipes section for detailed instructions!`,

  contact: `You can reach us at:

📧 Email: info@canelaceylon.com
📱 Phone: +94 77 123 4567
📍 Location: Colombo, Sri Lanka
🌐 Website: canelaceylon.com

Business hours: Mon-Fri 9AM-6PM (Sri Lanka Time)`,

  organic: `Our organic Ceylon cinnamon is:

• USDA Certified Organic
• EU Organic certified
• Grown without pesticides
• No chemical fertilizers
• Sustainably harvested
• Fair trade sourced
• Third-party tested for purity`,

  about: `About Canela Ceylon:

We are a family-owned business based in Sri Lanka, dedicated to bringing the finest Ceylon cinnamon to the world. Our cinnamon is:

• Sourced directly from local farmers
• Harvested at peak freshness
• Hand-processed using traditional methods
• Quality tested before shipping
• Sustainably and ethically produced

We've been in the cinnamon trade for over 25 years!`
};

// Helper function to find best matching response
function findResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  // Check for greetings
  if (/^(hello|hi|hey|greetings)/i.test(lowerMessage)) {
    return `Hello! 👋 Welcome to Canela Ceylon! I'm here to help you with any questions about our premium Ceylon cinnamon. What would you like to know?`;
  }
  
  // Check for thanks
  if (/thank/i.test(lowerMessage)) {
    return `You're welcome! 😊 If you have any more questions about our cinnamon products, feel free to ask. Enjoy your Canela Ceylon experience!`;
  }
  
  // Check for specific topics
  if (/ceylon|true cinnamon|what is|about cinnamon/i.test(lowerMessage)) {
    return knowledgeBase.ceylon;
  }
  
  if (/grade|type|alba|c5|c4|h1|variety/i.test(lowerMessage)) {
    return knowledgeBase.grades;
  }
  
  if (/health|benefit|good for|medicinal|blood sugar|diabetes/i.test(lowerMessage)) {
    return knowledgeBase.health;
  }
  
  if (/ship|deliver|international|tracking|worldwide/i.test(lowerMessage)) {
    return knowledgeBase.shipping;
  }
  
  if (/wholesale|bulk|business|large order|b2b/i.test(lowerMessage)) {
    return knowledgeBase.wholesale;
  }
  
  if (/cassia|difference|vs|compare|fake/i.test(lowerMessage)) {
    return knowledgeBase.difference;
  }
  
  if (/store|keep|fresh|expire|shelf life|preserve/i.test(lowerMessage)) {
    return knowledgeBase.storage;
  }
  
  if (/recipe|use|cook|how to|bake|drink/i.test(lowerMessage)) {
    return knowledgeBase.recipes;
  }
  
  if (/contact|email|phone|reach|support|help/i.test(lowerMessage)) {
    return knowledgeBase.contact;
  }
  
  if (/organic|certified|natural|pure/i.test(lowerMessage)) {
    return knowledgeBase.organic;
  }
  
  if (/about|company|who|history|story/i.test(lowerMessage)) {
    return knowledgeBase.about;
  }
  
  if (/price|cost|how much|expensive/i.test(lowerMessage)) {
    return `Our current prices (in Sri Lankan Rupees - LKR):

• **Alba Cinnamon** – 942 LKR
• **Ceylon Cinnamon Alba – Custom Bulk Orders (1kg+)** – 7,800 LKR
• **Ceylon Cinnamon C5 Special – Custom Bulk Orders** – 6,000 LKR
• **Cinnamon Alba Heritage Tokens** – 1,850 LKR

Visit our Products section for the full catalog and current stock availability!`;
  }
  
  if (/order|buy|purchase|cart/i.test(lowerMessage)) {
    return `To place an order:

1. Browse our Products section
2. Select your preferred cinnamon grade
3. Choose quantity and add to cart
4. Proceed to checkout
5. Enter shipping details
6. Complete payment securely

Need help? Contact us at info@canelaceylon.com!`;
  }
  
  // Default response
  return `Thank you for your question! While I may not have the specific answer, here's what I can help you with:

• Product information & grades
• Health benefits of Ceylon cinnamon
• Shipping & delivery
• Wholesale inquiries
• Recipes & usage tips
• Storage recommendations

Feel free to ask about any of these topics, or contact us at info@canelaceylon.com for personalized assistance!`;
}

// POST /api/chat - Handle chat messages
router.post("/", async (req, res) => {
  try {
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: "Message is required" 
      });
    }
    
    // Get response from knowledge base
    const response = findResponse(message);
    
    res.status(200).json({
      success: true,
      message: response
    });
    
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      message: "I apologize, but I'm having trouble right now. Please try again later or contact us at info@canelaceylon.com"
    });
  }
});

// GET /api/chat/health - Health check
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "chat" });
});

module.exports = router;
