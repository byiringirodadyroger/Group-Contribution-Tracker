function getFixedMembers(names) {
  return names.map((name, index) => ({
    name,
    normalizedName: name.trim().replace(/\s+/g, ' ').toLowerCase(),
    targetAmount: 20000,
    isAdminMember: index === 0,
    isActive: true
  }));
}

module.exports = { getFixedMembers };
